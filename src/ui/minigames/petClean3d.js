// Nettoyer en 3D : changer la litière du chat (dans le coin de la maison) ou faire la litière du clapier du lapin. La
// logique et la note sont celles du jeu dessiné (clean.js cleanGame) : 1) mettre les saletés dans le sac (chat) ou le
// seau (lapin), d'une tape ou en les y glissant ; 2) étaler du propre au doigt, une couche partout, ni trou ni tas,
// et s'arrêter avec « C'est bon ! ».
//
// Le sol du jeu dessiné (un rectangle du cadre 400 × 360) devient ici le fond du bac à litière (ou un coin de paille
// du clapier), vu de haut : le doigt est ramené sur ce plan (lancer de rayon), puis dans les coordonnées du jeu
// dessiné ; ses saletés, ses cases de litière propre et son sac sont posés en 3D aux mêmes endroits. Notre main tient
// la pelle (ou une poignée de foin). L'animal attend à côté et regarde ce qu'on fait.

import * as THREE from 'three';
import { cleanGame, drawMiniGauge, SPREAD_ZONE } from './clean.js';
import { withLogic } from './care3d.js';
import { own, shadowed, holdHand } from '../../game/care/petProps.js';
import { petHand, shoulderFor } from '../../game/care/petHand.js';
import { zincTexture } from '../../game/care/petBath.js';
import { paint, hayTexture } from '../../game/care/textures.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Une boule irrégulière (sphère bosselée). */
function lump(keep, r, seed = 1, k = 0.25) {
  const g = keep(new THREE.SphereGeometry(r, 12, 9));
  const p = g.attributes.position;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const bumps = [0, 1, 2, 3].map(() => ({ d: v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), a: (rnd() - 0.3) * k }));
  for (let i = 0; i < p.count; i++) {
    const v = v3().fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let f = 1;
    for (const b of bumps) f += b.a * Math.max(0, n.dot(b.d)) ** 3;
    v.multiplyScalar(f);
    p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function petClean3dGame(ctx) {
  const sc = ctx.scene;
  const sp = sc.species;
  const cat = sp === 'cat';
  sc.decor.layout('rest');
  const L = sc.marks;
  const S = L.size;
  const keep = own();
  const m = sc.mood;
  m.posture = cat ? 'sit' : 'crouch';
  m.ears = 'forward';
  m.happy = 0.4;

  // ---------------------------------------------------------------- le plan du jeu dessiné, en 3D
  let play = null;
  const anchor = () => (play ? sc.project(binTop) : { x: 200, y: 140 });
  // (le point où l'on pose les mots du jeu : au-dessus du sac)
  let binTop = v3();
  play = withLogic(ctx, cleanGame, anchor);
  const s0 = play.peek();
  const F = s0.floor;
  const Ww = cat ? clamp(S.len * 0.85, 0.34, 0.5) : clamp(S.len * 1.8, 0.45, 0.75);
  const Dw = (Ww * F.h) / F.w;
  const mpp = Ww / F.w; // (mètres par unité du jeu dessiné)
  const boxH = cat ? clamp(Ww * 0.26, 0.075, 0.12) : 0;
  const topY = cat ? boxH * 0.45 : 0.014;
  const C = v3(L.nose.x + 0.06 + Ww / 2, 0, sc.holder.position.z + (cat ? 0.03 : Dw * 0.22));
  const toW = (lx, ly, y = topY) => v3(C.x + ((lx - (F.x + F.w / 2)) / F.w) * Ww, y, C.z + ((ly - (F.y + F.h / 2)) / F.h) * Dw);
  const toL = (P) => ({ x: F.x + F.w / 2 + ((P.x - C.x) / Ww) * F.w, y: F.y + F.h / 2 + ((P.z - C.z) / Dw) * F.h });
  const fromScreen = (p) => {
    const P = sc.pointOnPlane(p.x, p.y, topY);
    return P ? toL(P) : null;
  };

  // ---------------------------------------------------------------- le bac (chat) ou le coin de paille (lapin)
  const root = new THREE.Group();
  sc.scene.add(root);
  if (cat) {
    // bac en plastique aux coins arrondis, bord roulé
    const shape = (w, d, r) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -d / 2);
      s.lineTo(w / 2 - r, -d / 2);
      s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
      s.lineTo(w / 2, d / 2 - r);
      s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
      s.lineTo(-w / 2 + r, d / 2);
      s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
      s.lineTo(-w / 2, -d / 2 + r);
      s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
      return s;
    };
    const wall = Math.max(0.008, Ww * 0.03);
    const outer = shape(Ww + wall * 2, Dw + wall * 2, Ww * 0.1);
    outer.holes.push(shape(Ww, Dw, Ww * 0.08));
    const plastic = keep(new THREE.MeshStandardMaterial({ color: 0x86afc8, roughness: 0.38 }));
    const walls = shadowed(new THREE.Mesh(keep(new THREE.ExtrudeGeometry(outer, { depth: boxH, bevelEnabled: true, bevelThickness: wall * 0.4, bevelSize: wall * 0.4, bevelSegments: 3, curveSegments: 8 })), plastic));
    walls.rotation.x = -Math.PI / 2;
    walls.position.copy(C);
    root.add(walls);
    const bottom = shadowed(new THREE.Mesh(keep(new THREE.ShapeGeometry(shape(Ww + wall * 2, Dw + wall * 2, Ww * 0.1))), plastic));
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.copy(C).setY(0.003);
    root.add(bottom);
  }
  // ---- la litière (ou la paille) : une toile peinte, sale, où l'on peint le propre case par case
  const CW = 256;
  const CH = Math.round((CW * F.h) / F.w);
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g2 = canvas.getContext('2d');
  const litterTex = keep(new THREE.CanvasTexture(canvas));
  litterTex.colorSpace = THREE.SRGBColorSpace;
  const hay = keep(hayTexture(4));
  /** Grains de litière (sable clair ou gris sale), ou brins de paille (dorée ou salie). */
  const grains = (fresh, key) => paint(128, 128, (c) => {
    let s = fresh ? 3 : 7;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    if (cat) {
      c.fillStyle = fresh ? '#efe9dc' : '#aaa292';
      c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 1600; i++) {
        const v = fresh ? 205 + r() * 50 : 130 + r() * 50;
        c.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
        c.beginPath();
        c.arc(r() * 128, r() * 128, 0.6 + r() * 1.4, 0, Math.PI * 2);
        c.fill();
      }
      if (!fresh) for (let i = 0; i < 9; i++) {
        c.fillStyle = 'rgba(110,98,78,0.35)';
        c.beginPath();
        c.ellipse(r() * 128, r() * 128, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      c.drawImage(hay.image, 0, 0, 128, 128);
      if (!fresh) {
        c.fillStyle = 'rgba(95,75,40,0.45)';
        c.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 10; i++) {
          c.fillStyle = 'rgba(70,52,28,0.4)';
          c.beginPath();
          c.ellipse(r() * 128, r() * 128, 8 + r() * 12, 5 + r() * 7, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
      } else {
        c.fillStyle = 'rgba(255,236,150,0.25)';
        c.fillRect(0, 0, 128, 128);
      }
    }
  }, key);
  const dirtyImg = grains(false, `petLitter|${sp}|0`);
  const freshImg = grains(true, `petLitter|${sp}|1`);
  let painted = '';
  const cellPx = (s0.step / F.w) * CW;
  // (le propre : un masque doux, case par case, qui se fond avec ses voisines en une couche continue ; les tas, plus
  // sombres et plus denses)
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    return c;
  };
  const mask = mk();
  const layer = mk();
  const mg = mask.getContext('2d');
  const lg = layer.getContext('2d');
  function repaint(cells) {
    const sig = cells.map((c) => Math.min(3, c.n)).join('');
    if (sig === painted) return;
    painted = sig;
    mg.clearRect(0, 0, CW, CH);
    for (const c of cells) {
      if (c.n <= 0) continue;
      const x = ((c.x - F.x) / F.w) * CW;
      const y = ((c.y - F.y) / F.h) * CH;
      const r = cellPx * 0.95;
      const gr = mg.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      mg.fillStyle = gr;
      mg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    lg.clearRect(0, 0, CW, CH);
    for (let y = 0; y < CH; y += 128) for (let x = 0; x < CW; x += 128) lg.drawImage(freshImg, x, y);
    // les tas : plus sombres, plus denses au milieu
    for (const c of cells) {
      if (c.n < 2) continue;
      const x = ((c.x - F.x) / F.w) * CW;
      const y = ((c.y - F.y) / F.h) * CH;
      const r = cellPx * 0.7;
      const gr = lg.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, cat ? 'rgba(120,110,92,0.5)' : 'rgba(150,105,25,0.5)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr;
      lg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    lg.globalCompositeOperation = 'destination-in';
    lg.drawImage(mask, 0, 0);
    lg.globalCompositeOperation = 'source-over';
    g2.clearRect(0, 0, CW, CH);
    g2.save();
    // (le coin de paille du clapier a des bords qui s'effacent dans la paille autour)
    if (!cat) {
      g2.beginPath();
      g2.roundRect(4, 4, CW - 8, CH - 8, 30);
      g2.clip();
    }
    for (let y = 0; y < CH; y += 128) for (let x = 0; x < CW; x += 128) g2.drawImage(dirtyImg, x, y);
    g2.drawImage(layer, 0, 0);
    g2.restore();
    litterTex.needsUpdate = true;
  }
  const surf = shadowed(new THREE.Mesh(keep(new THREE.PlaneGeometry(Ww, Dw)), keep(new THREE.MeshStandardMaterial({ map: litterTex, roughness: 0.95, transparent: !cat }))), false);
  surf.rotation.x = -Math.PI / 2;
  surf.position.copy(C).setY(topY);
  root.add(surf);
  repaint(s0.cells);
  const heapGeo = keep(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  const freshTex = keep(new THREE.CanvasTexture(freshImg));
  freshTex.colorSpace = THREE.SRGBColorSpace;
  const heapMat = keep(new THREE.MeshStandardMaterial({ map: freshTex, roughness: 1 }));

  // ---------------------------------------------------------------- le sac (chat) ou le seau (lapin)
  const bin = s0.bin;
  const binAt = toW(bin.x, bin.y, 0);
  const binR = Math.max(0.06, Ww * 0.17);
  const binH = binR * 1.5;
  binTop = binAt.clone().setY(binH);
  if (cat) {
    // un sac poubelle blanc, un peu froissé, ouvert en haut, le bord roulé
    const prof = [[0, 0], [binR * 0.85, 0.004], [binR, binH * 0.25], [binR * 1.02, binH * 0.7], [binR * 0.92, binH * 0.95], [binR * 0.98, binH]];
    const geo = keep(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.05 * Math.sin(a * 7 + p.getY(i) * 60) + 0.03 * Math.sin(a * 13);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const bag = shadowed(new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ color: 0xf1f3f0, roughness: 0.45, side: THREE.DoubleSide }))));
    bag.position.copy(binAt);
    root.add(bag);
    const lip = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(binR, binR * 0.08, 8, 28)), bag.material));
    lip.rotation.x = Math.PI / 2;
    lip.position.copy(binAt).setY(binH);
    root.add(lip);
  } else {
    const prof = [[0, 0.003], [binR * 0.8, 0.003], [binR, binH]];
    const geo = keep(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 32));
    const zinc = keep(zincTexture());
    zinc.repeat.set(2, 1);
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, map: zinc, metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide }));
    const bucket = shadowed(new THREE.Mesh(geo, metal));
    bucket.position.copy(binAt);
    root.add(bucket);
    const rim = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(binR, binR * 0.05, 8, 32)), metal));
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(binAt).setY(binH);
    root.add(rim);
    const handle = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(binR * 0.95, binR * 0.03, 6, 24, Math.PI)), metal));
    handle.position.copy(binAt).setY(binH);
    handle.rotation.y = 0.4;
    handle.rotation.z = 0.35;
    root.add(handle);
  }

  // ---------------------------------------------------------------- les saletés
  const brown = keep(new THREE.MeshStandardMaterial({ color: 0x5b3c22, roughness: 0.75 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x3d2a1a, roughness: 0.6 }));
  const clumpMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a8273, roughness: 1 }));
  const items = s0.all.map((it, i) => {
    const g = new THREE.Group();
    if (cat && it.seed >= 2) {
      // une boule de litière mouillée
      const b = shadowed(new THREE.Mesh(lump(keep, 16 * mpp, i + 1, 0.35), clumpMat));
      b.position.y = 16 * mpp * 0.5;
      g.add(b);
    } else if (cat) {
      // une petite crotte : deux boudins
      for (const [dx, dz, r, a] of [[-6, 1, 7, 0.4], [6, -2, 6, -0.5]]) {
        const c = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(r * mpp * 0.55, r * mpp * 1.2, 4, 8)), brown));
        c.rotation.set(Math.PI / 2, 0, a);
        c.position.set(dx * mpp, r * mpp * 0.5, dz * mpp);
        g.add(c);
      }
    } else {
      // des crottes de lapin : de petites billes rondes, en tas
      const bead = keep(new THREE.SphereGeometry(4.8 * mpp, 10, 8));
      for (let k = 0; k < 7; k++) {
        const b = shadowed(new THREE.Mesh(bead, dark));
        const a = it.seed + k * 0.9;
        b.position.set(Math.cos(a) * (6 + (k % 3) * 5) * mpp, 4.8 * mpp * (k === 6 ? 1.6 : 0.8), Math.sin(it.seed + k * 1.7) * 8 * mpp);
        g.add(b);
      }
    }
    g.position.copy(toW(it.x, it.y));
    g.rotation.y = it.seed;
    root.add(g);
    return { g, state: it.state, from: null };
  });

  // ---------------------------------------------------------------- l'outil : la pelle (et notre main)
  const tool = new THREE.Group();
  const ts = Math.max(0.6, Ww / 0.45);
  const scoopMat = keep(new THREE.MeshStandardMaterial({ color: cat ? 0x5fa8a0 : 0x9aa3a8, roughness: cat ? 0.4 : 0.3, metalness: cat ? 0 : 0.7 }));
  const pan = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.08 * ts, 0.006 * ts, 0.07 * ts)), scoopMat));
  tool.add(pan);
  for (const sd of [-1, 1]) {
    const lip = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.08 * ts, 0.016 * ts, 0.005 * ts)), scoopMat));
    lip.position.set(0, 0.008 * ts, sd * 0.035 * ts);
    tool.add(lip);
  }
  const back = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.005 * ts, 0.02 * ts, 0.07 * ts)), scoopMat));
  back.position.set(0.04 * ts, 0.01 * ts, 0);
  tool.add(back);
  const stick = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006 * ts, 0.008 * ts, 0.1 * ts, 10)), scoopMat));
  stick.rotation.z = Math.PI / 2 - 0.35;
  stick.position.set(0.09 * ts, 0.025 * ts, 0);
  tool.add(stick);
  // (une pelletée de propre, à l'étape 2)
  const load = shadowed(new THREE.Mesh(heapGeo, heapMat), false);
  load.scale.set(0.03 * ts, 0.014 * ts, 0.028 * ts);
  load.position.y = 0.004 * ts;
  load.visible = false;
  tool.add(load);
  tool.visible = false;
  root.add(tool);
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), grip: 0.85, size: Math.max(0.6, Math.min(1, ts * 0.85)) });
  hand.visible = false;
  root.add(hand);
  const grainTex = freshTex;

  // ---------------------------------------------------------------- cadrage : vu de haut, le bac, le sac, sa tête
  const corners = [toW(F.x, F.y), toW(F.x + F.w, F.y), toW(F.x, F.y + F.h), toW(F.x + F.w, F.y + F.h)];
  // (lui tout entier, à côté, qui regarde)
  sc.frame([...corners, binTop.clone().add(v3(binR, 0, 0)), binAt.clone().add(v3(binR, 0, binR)), L.poll, ...L.ears, L.muzzle, L.chest, L.croup, L.tail, ...L.paws], { dir: [0.25, 1.7, 1], pad: 1.06, now: true });

  let lastDirt = 0;
  let lastPhase = s0.phase;
  let spill = 0;
  return {
    peek: () => ({ ...play.peek(), toScreen: (lx, ly) => sc.project(toW(lx, ly)) }),
    key: (c, d) => play.key?.(c, d),
    down(p) {
      const q = fromScreen(p);
      if (q) play.down(q);
    },
    move(p, down) {
      const q = fromScreen(p);
      if (q) play.move(q, down);
    },
    up(p) {
      const q = fromScreen(p) ?? { x: -999, y: -999 };
      play.up(q);
    },
    update(dt) {
      play.update(dt);
      const s = play.peek();
      // les saletés : par terre, sur la pelle, en vol jusqu'au sac (en cloche), dedans
      s.all.forEach((it, i) => {
        const o = items[i];
        if (it.state === 'floor') o.g.position.copy(toW(it.x, it.y));
        else if (it.state === 'held') o.g.position.copy(toW(it.x, it.y, topY + 0.012 * ts));
        else if (it.state === 'fly') {
          if (o.state !== 'fly') o.from = o.g.position.clone();
          const k = it.k;
          o.g.position.copy(o.from).lerp(binTop, k).add(v3(0, Math.sin(k * Math.PI) * Math.max(0.08, Ww * 0.35), 0));
        } else if (it.state === 'bin') o.g.visible = false;
        o.state = it.state;
      });
      repaint(s.cells);
      // l'outil sous le doigt, sur la litière ; notre main tient le manche
      const pp = ctx.pointer;
      const P = pp.down || pp.over ? sc.pointOnPlane(pp.x, pp.y, topY) : null;
      tool.visible = !!P && !ctx.done;
      hand.visible = tool.visible;
      if (P) {
        tool.position.copy(P).add(v3(0, 0.004 * ts, 0));
        tool.rotation.set(0, -0.5, s.phase === 'spread' && pp.down ? -0.5 : 0.12);
        load.visible = s.phase === 'spread';
        tool.updateMatrixWorld(true);
        const grip = tool.localToWorld(v3(0.13 * ts, 0.04 * ts, 0));
        holdHand(hand, grip, v3(0, 1, 0), shoulderFor(sc, grip));
        // (on étale : des grains tombent de la pelle)
        if (s.phase === 'spread' && pp.down) {
          spill += dt * 30;
          while (spill > 1) {
            spill--;
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: grainTex, transparent: true, depthWrite: false }));
            const r = 0.004 * ts * (0.6 + Math.random());
            spr.scale.set(r, r, r);
            spr.position.copy(tool.localToWorld(v3(-0.04 * ts, 0.01 * ts, (Math.random() - 0.5) * 0.06 * ts)));
            sc.spawn(spr, { life: 0.35, v: v3((Math.random() - 0.5) * 0.1, -0.2, (Math.random() - 0.5) * 0.1), grav: 3 });
          }
        }
      }
      // lui : il regarde ce qu'on fait ; content quand c'est propre
      if (s.dirtInBin > lastDirt) {
        lastDirt = s.dirtInBin;
        if (lastDirt === s.nDirt) audio.animal?.(sp, 'happy', ctx.a?.id ?? null);
      }
      if (s.phase !== lastPhase) lastPhase = s.phase;
      m.look = P ?? C.clone().setY(topY);
      m.lookAmt = 0.7;
      m.happy = ctx.done ? 1 : 0.35 + 0.5 * (s.dirtInBin / Math.max(1, s.nDirt));
      m.sniff = !cat && !ctx.done && Math.random() < 0.002 ? true : m.sniff && Math.random() > 0.02;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      if (s.phase === 'pick') {
        g.save();
        g.fillStyle = 'rgba(255,255,255,0.88)';
        g.beginPath();
        g.roundRect(v.x0 + 10, v.y0 + 10, 112, 40, 14);
        g.fill();
        g.font = `20px ${EMOJI}`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(cat ? '🧹' : '🧹', v.x0 + 20, v.y0 + 31);
        g.font = '800 19px system-ui, sans-serif';
        g.fillStyle = '#3a2a1a';
        g.fillText(`${s.dirtInBin} / ${s.nDirt}`, v.x0 + 50, v.y0 + 31);
        g.restore();
      } else if (!ctx.done) {
        // la petite jauge : une couche partout, la zone verte
        drawMiniGauge(g, v.x1 - 30, v.y0 + 20, 14, 130, s.value / SPREAD_ZONE.max, SPREAD_ZONE.lo / SPREAD_ZONE.max, SPREAD_ZONE.hi / SPREAD_ZONE.max);
        g.save();
        g.font = `18px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(cat ? '🥄' : '🌾', v.x1 - 23, v.y0 + 166);
        g.restore();
      }
    },
    destroy() {
      sc.scene.remove(root);
      keep.dispose();
    },
  };
}

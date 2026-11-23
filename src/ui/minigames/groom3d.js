// Le salon de toilettage du cheval, en 3D, sur le vrai cheval (scène des soins : src/game/care/stage.js). Le bain et
// le brossage sont déjà les soins 3D (wash3d.js, pansage3d.js) ; ici les autres étapes, pour le cheval :
//
// - gdry (séchage) : le couteau de chaleur (racloir) dans le sens du poil, l'eau qui coule, puis la serviette ; la
//   robe mouillée (un voile sombre et brillant, sommet par sommet : le moteur du lustrage, beauty3d.js) sèche là où on
//   passe. Le racloir sur la tête ou les jambes lui fait peur (la note du salon : ctx.stress, comme le séchoir) ;
// - gknots (démêlage) : la crinière puis la queue au peigne, de haut en bas (comme le peigne du pansage) ; tirer trop
//   vite, ça fait « Aïe ! » (même note que le jeu dessiné : moins un quart par coup de trop) ;
// - gfinish (finitions) : le ruban et sa couleur (les boutons du jeu dessiné : ctx.choice), et à chaque « pschitt »
//   une partie des tresses de la crinière se fait, au ruban de la couleur choisie (le moteur des tresses) ;
// - gcut (tonte) : la tondeuse enlève le poil d'hiver en bandes, sur la robe ; la logique, les zones à garder et la
//   note sont celles du jeu dessiné (cutGame), le geste est reporté sur le cheval dessiné.

import * as THREE from 'three';
import { withLogic } from './care3d.js';
import { finishGame, cutGame } from './groomer.js';
import { groomTool } from '../../game/care/props.js';
import { ACC_COLORS } from '../../sim/groomer.js';
import { coatGloss, bodyFrame, bodyTo2d, clothHand, handOnCoat, crestBraids } from './beauty3d.js';
import { headShape, headFollow } from './headFrame.js';
import { nicker, snort } from './feed3d.js';
import { clamp, distToSegment, circle, emoji } from './draw.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BODY = new Set(['body', 'shoulder', 'hip']);
const WET = 1.45; // (robe trempée : le voile d'eau à fond)

/** Ce que tous ces jeux partagent : la scène, ce qu'on libère, le cadrage de tout le cheval et de sa tête. */
function setup(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const S = sc.double.scale;
  const L = sc.marks;
  const whole = [L.withers, L.croup, L.back, L.belly, L.chest, L.tail, L.tail.clone().lerp(L.tailTip, 0.6), L.tail.clone().add(v3(-0.18 * S, -0.3 * S, 0)), L.croup.clone().lerp(L.tail, 0.8).add(v3(-0.16 * S, -0.12 * S, 0)), ...L.hooves];
  const follow = headFollow(sc, headShape(sc), () => whole, { dir: [0.34, 0.16, 1], pad: 1.16, half: 0.5, reach: 0.1 });
  return { sc, keep, own, S, L, follow, whole };
}

/** Région d'après le nom de l'os (comme stage.regionOf). */
function regionFor(bone = '') {
  if (/^Head|^Ear/.test(bone)) return 'head';
  if (/^Neck|^Mane/.test(bone)) return 'neck';
  if (/^Tail/.test(bone)) return 'tail';
  if (/^(F|H)(L|R)[34]$/.test(bone)) return 'leg';
  if (/^F(L|R)[12]$/.test(bone)) return 'shoulder';
  if (/^H(L|R)[12]$/.test(bone)) return 'hip';
  return 'body';
}

/** Les sommets de la robe sur le corps (pas la tête, l'encolure haute, les jambes) : repère du cheval. */
function onBody(sc, F) {
  const q = v3();
  return (i, x, y, z) => {
    q.set(x, y, z);
    sc.holder.worldToLocal(q);
    return q.z > F.z0 - 0.05 && q.z < F.z1 + 0.06 && q.y > F.y0 - 0.06;
  };
}

/** Des gouttes d'eau en 3D qui tombent d'un point (le racloir, la serviette). */
function drops(sc, at, n, own, mat, geo) {
  for (let i = 0; i < n; i++) {
    const d = new THREE.Mesh(geo, mat);
    d.position.copy(at).add(v3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.03));
    d.scale.setScalar(0.6 + Math.random() * 0.6);
    sc.spawn(d, { life: 0.6 + Math.random() * 0.3, v: v3((Math.random() - 0.5) * 0.2, -0.2, 0.15 + Math.random() * 0.1), grav: 4, fade: false });
  }
}

// ---------------------------------------------------------------- 💨 séchage

export function gdry3dGame(ctx) {
  const { a, t } = ctx;
  const { sc, keep, own, S, L, follow } = setup(ctx);
  const m = sc.mood;
  m.ears = 'forward';
  const F = bodyFrame(sc);
  const body = onBody(sc, F);
  // La robe mouillée : la couleur de sa robe, plus foncée, et luisante d'eau (un poil mouillé fonce et brille),
  // partout sauf la tête au départ (le bain l'a trempé de l'encolure aux sabots).
  const coatCol = new THREE.Color(a?.look?.coat ?? 0x8a5a2b);
  const wet = coatGloss(sc, own, { additive: false, base: [coatCol.r * 0.42, coatCol.g * 0.4, coatCol.b * 0.42], alpha: 0.5, roughness: 0.1, env: 2.2, over: 99 });
  const notHead = (() => {
    const q = v3();
    return (x, y, z) => {
      q.set(x, y, z);
      sc.holder.worldToLocal(q);
      return q.z < F.z1 + 0.22;
    };
  })();
  if (wet) {
    const pos = wet.positions(0);
    for (let i = 0; i < wet.count; i++) if (notHead(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) wet.set(i, WET);
    wet.flush();
  }
  // Ce qu'on compte : des points du flanc qu'on voit (rayons lancés vers lui depuis notre côté, comme le lavage),
  // chacun mouillé à 1 ; le racloir et la serviette les sèchent quand ils passent dessus.
  sc.proxy.bake();
  const cells = [];
  const step = 0.12 * S;
  for (let x = L.tail.x + 0.12 * S; x <= L.chest.x; x += step) {
    for (let y = L.belly.y + 0.05 * S; y <= L.withers.y; y += step * 0.9) {
      const h = sc.proxy.hit(new THREE.Ray(v3(x, y, sc.holder.position.z + 2.5), v3(0, 0, -1)), -9, 1e9);
      if (!h || !BODY.has(regionFor(h.boneName))) continue;
      cells.push({ p: h.point, wet: 1 });
    }
  }
  const wetNow = () => (cells.length ? cells.reduce((n, c) => n + c.wet, 0) / cells.length : 0);
  // Les outils : le couteau de chaleur (une lame d'alu courbe et sa poignée rouge), puis la serviette dans la main.
  const scraper = scraperModel(own);
  scraper.scale.setScalar(1.6 * Math.max(0.8, S));
  scraper.visible = false;
  sc.scene.add(scraper);
  const towel = clothHand(sc, own, 0x8fc4e8);
  towel.geo.scale(1.25, 1.25, 1.6);
  const dropMat = own(new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.05, transparent: true, opacity: 0.8 }));
  dropMat.userData.shared = true;
  const dropGeo = own(new THREE.SphereGeometry(0.008, 6, 4));
  dropGeo.userData.shared = true;
  let tool = 'scraper';
  let last = null;
  let stress = 0;
  let peak = 0;
  let wrongDir = 0;
  let lastOuch = -9;
  let goodLen = 0;
  let saidTowel = false;
  let started = false;
  ctx.stress = 0;
  ctx.hint(t('mg_gdry3d_scraper'));
  follow.frame(true);

  function stroke(p) {
    if (ctx.done) return;
    const h = sc.pickAnimal(p.x, p.y);
    if (!last) {
      last = { p, h };
      return;
    }
    const dx = p.x - last.p.x;
    const dy = p.y - last.p.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) return;
    last = { p, h };
    if (!h) return;
    if (tool === 'scraper' && (h.region === 'head' || h.region === 'leg')) {
      // le racloir sur la tête ou les jambes (os, peau fine) : il n'aime pas du tout
      if (ctx.time - lastOuch > 0.25) {
        lastOuch = ctx.time;
        stress = Math.min(1, stress + 0.12);
        m.annoyed = 0.6;
        sc.shake = 0.2;
        ctx.hint(t('mg_gdry3d_notHead'), 'warn');
      }
      return;
    }
    if (tool === 'scraper' && !BODY.has(h.region)) return;
    if (!wet) return;
    // le racloir : dans le sens du poil (vers la queue, à gauche de l'image) ; la serviette : dans tous les sens
    const along = tool === 'towel' || dx < -d * 0.35;
    if (!along) {
      wrongDir += d;
      if (wrongDir > 160) {
        wrongDir = 0;
        ctx.hint(t('mg_gdry3d_dir'), 'warn');
      }
      return;
    }
    const r = (tool === 'scraper' ? 0.1 : 0.13) * S;
    const rate = (tool === 'scraper' ? 0.02 : 0.014) * d;
    let took = 0;
    for (const c of cells) {
      if (c.wet <= 0) continue;
      const dd = c.p.distanceTo(h.point);
      if (dd > r * 1.1) continue;
      const k = Math.min(c.wet, (rate / WET) * (1 - (0.5 * dd) / r));
      c.wet -= k;
      took += k;
    }
    wet.wipe(h.point, r, rate, ctx.time, tool === 'towel' ? null : body);
    if (took > 0) {
      goodLen += d;
      if (Math.random() < 0.6) drops(sc, h.point, tool === 'scraper' ? 3 : 1, own, dropMat, dropGeo);
      if (goodLen > 150) {
        goodLen = 0;
        if (tool === 'scraper') ctx.hint(t('mg_gdry3d_good'), 'good');
      }
    }
  }

  return {
    peek: () => ({ wet: wetNow(), tool, stress, peak, three: true }),
    down(p) {
      last = null;
      stroke(p);
    },
    move(p, down) { if (down) stroke(p); },
    up() { last = null; },
    key() {},
    update(dt) {
      if (!ctx.done) sc.setFocus(56 * ctx.view.scale, sc.size.h);
      if (!started) follow.frame(true);
      started = true;
      follow.update(dt);
      const w = wetNow();
      // le racloir a fait son travail : la serviette pour finir
      if (tool === 'scraper' && w < 0.4) {
        tool = 'towel';
        if (!saidTowel) {
          saidTowel = true;
          ctx.hint(t('mg_gdry3d_towel', { g: a?.sex }), 'good');
        }
      }
      stress = Math.max(0, stress - dt * 0.1);
      peak = Math.max(peak, stress);
      ctx.stress = peak;
      ctx.progress(1 - w);
      // (fini : ce qui reste d'eau, sur les jambes et l'encolure, s'évapore doucement)
      if (ctx.done && wet) wet.fade(dt, 1.2);
      wet?.flush();
      if (w <= 0.05 && !ctx.done) {
        ctx.finish(1 - peak * 0.6, peak < 0.25 ? t('mg_gdry_end', { name: a.name, g: a.sex }) : undefined);
        nicker(sc);
        m.nod = 1;
        snort(sc);
      }
      // l'outil sous le doigt
      const pp = ctx.pointer;
      const h = !ctx.done && (pp.down || pp.over) ? sc.pickAnimal(pp.x, pp.y) : null;
      scraper.visible = tool === 'scraper' && !!h;
      towel.hand.visible = tool === 'towel' && !!h;
      if (h && tool === 'scraper') {
        scraper.position.lerp(h.point.clone().addScaledVector(h.normal, pp.down ? 0.004 : 0.03), scraper.visible ? Math.min(1, dt * 25) : 1);
        scraper.quaternion.setFromUnitVectors(v3(0, 1, 0), h.normal);
      } else if (h) handOnCoat(towel.hand, h, pp.down ? 1 : 0, sc);
      m.ears = stress > 0.3 ? 'back' : 'forward';
      m.look = sc.camera.position;
      m.lookAmt = 0.35;
      // des gouttes tombent tant qu'il est mouillé
      if (w > 0.1 && Math.random() < w * dt * 6) {
        const at = L.belly.clone().lerp(L.chest, Math.random()).add(v3(0, 0, 0.12 * S));
        drops(sc, at, 1, own, dropMat, dropGeo);
      }
    },
    draw(g) {
      if (!sc.ready || ctx.done) return;
      // la jauge de peur, en haut à droite (comme le séchoir du jeu dessiné)
      const v = ctx.view;
      const x = v.x1 - 104;
      const y = v.y0 + 12;
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.beginPath();
      g.roundRect(x - 6, y - 4, 98, 26, 12);
      g.fill();
      g.fillStyle = '#ece4d2';
      g.beginPath();
      g.roundRect(x + 22, y + 5, 62, 9, 5);
      g.fill();
      g.fillStyle = stress > 0.6 ? '#e0574a' : '#e6b23a';
      g.beginPath();
      g.roundRect(x + 22, y + 5, Math.max(4, 62 * stress), 9, 5);
      g.fill();
      g.restore();
      emoji(g, stress > 0.6 ? '😨' : '🙂', x + 8, y + 9, 18);
    },
    destroy() {
      wet?.remove();
      scraper.parent?.remove(scraper);
      towel.hand.parent?.remove(towel.hand);
      for (const x of keep) x.dispose?.();
    },
  };
}

/** Le couteau de chaleur : une lame d'aluminium courbe, à poignée rouge (origine : le bord qui touche le poil). */
function scraperModel(own) {
  const g = new THREE.Group();
  const alu = own(new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.3, metalness: 0.85 }));
  const red = own(new THREE.MeshStandardMaterial({ color: 0xd23d3d, roughness: 0.5 }));
  const blade = new THREE.Mesh(own(new THREE.TorusGeometry(0.09, 0.004, 6, 30, Math.PI)), alu);
  blade.rotation.x = Math.PI / 2;
  blade.scale.set(1, 1, 0.35);
  blade.position.y = 0.004;
  g.add(blade);
  const edge = new THREE.Mesh(own(new THREE.BoxGeometry(0.18, 0.012, 0.004)), alu);
  edge.position.set(0, 0.006, 0);
  g.add(edge);
  const handle = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.014, 0.09, 6, 12)), red);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.03, -0.075);
  g.add(handle);
  for (const o of g.children) o.castShadow = true;
  return g;
}

// ---------------------------------------------------------------- 🧶 démêlage

/** Où accrocher un nœud : dans la crinière (sous la crête, côté caméra) ou dans la queue (k : 0 haut, 1 bas). */
function knotSpot(sc, part, k) {
  const md = sc.model;
  const S = sc.double.scale;
  if (part === 'mane' && md.braidSpots?.crest?.length && md.neck) {
    const list = md.braidSpots.crest;
    const at = list[Math.min(list.length - 1, Math.round((1 - k) * (list.length - 1)))];
    return { p: md.neck.localToWorld(at[0].clone()).add(v3(0, -0.14 * S, 0.17 * S)), bone: md.neck };
  }
  if (part === 'tail' && md.tailTip) {
    const tip = md.tailTip.localToWorld(v3(0, -0.62, 0));
    return { p: sc.marks.tail.clone().lerp(tip, 0.25 + 0.6 * k).add(v3(0, 0, 0.07 * S)), bone: md.tailTip };
  }
  const p = (part === 'mane' ? sc.marks.withers.clone().lerp(sc.marks.poll, k) : sc.marks.tail.clone()).add(v3(0, -0.1, 0.08));
  return { p, bone: sc.holder };
}

/** Un nœud de crins : une petite pelote bosselée. */
function knotGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + r() * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 1.3, p.getZ(i) * k * 0.8);
  }
  geo.computeVertexNormals();
  return geo;
}

export function gknots3dGame(ctx) {
  const { a, t, fx } = ctx;
  const { sc, keep, own, S, L } = setup(ctx);
  const m = sc.mood;
  m.ears = 'forward';
  const knots = [];
  const geo = own(knotGeometry());
  const mat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(a?.look?.mane ?? 0x2a1d14).multiplyScalar(0.85), roughness: 0.85 }));
  for (const [part, ks] of [['mane', [0.25, 0.5, 0.78]], ['tail', [0.35, 0.65, 0.92]]]) {
    for (const k of ks) {
      const sp = knotSpot(sc, part, k);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(0.06 * S);
      mesh.position.copy(sp.p);
      mesh.rotation.set(k * 7, k * 3, k * 5);
      mesh.castShadow = true;
      sc.scene.add(mesh);
      sp.bone.attach(mesh);
      knots.push({ part, mesh, left: 1, x: 0, y: 0, r: 12 });
    }
  }
  const total = knots.length;
  const comb = groomTool('comb', own);
  comb.scale.setScalar(1.7 * Math.max(0.8, S));
  comb.visible = false;
  sc.scene.add(comb);
  let tugs = 0;
  let last = null;
  let lastT = 0;
  let acc = 0;
  let speed = 0;
  let goodLen = 0;
  let badLen = 0;
  let saidTail = false;
  let on = null;
  const maneFollow = headFollow(sc, headShape(sc), () => [], { dir: [0.2, 0.2, 1], pad: 1.22, half: 0.5, reach: 0.06 });
  const progress = () => 1 - knots.reduce((n, k) => n + k.left, 0) / Math.max(1, total);
  ctx.hint(t('mg_gknots3d_hint'));

  const place = (k) => {
    const w = k.mesh.getWorldPosition(v3());
    const p = sc.project(w);
    k.x = p.x;
    k.y = p.y;
    k.rr = Math.max(12, sc.projectRadius(w, 0.06 * S));
    return k;
  };
  function frameOn(part) {
    if (on === part) return;
    on = part;
    const pts = knots.filter((k) => k.part === part).map((k) => k.mesh.getWorldPosition(v3()));
    // la crinière : toute la tête aussi (avant, le bout du nez et la moitié de la tête sortaient à droite) ; elle est
    // suivie en douceur quand il tourne un peu la tête
    if (part === 'mane') {
      maneFollow.set({}, () => [...pts, L.withers, L.neck.clone().add(v3(0, -0.25 * S, 0))]);
      maneFollow.frame(false);
    } else sc.frame([...pts, L.tail, L.croup, L.tailTip, L.tailTip.clone().add(v3(0, -0.1, 0))], { dir: [-0.25, 0.15, 1], pad: 1.25 });
  }

  function work(p) {
    if (ctx.done) return;
    if (!last) {
      last = p;
      lastT = ctx.time;
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    // (vitesse du peigne : le chemin fait depuis la dernière image comptée ; plusieurs gestes dans la même image
    // s'additionnent, sinon un seul déplacement semblait infiniment rapide)
    acc += d;
    const dtm = ctx.time - lastT;
    if (dtm > 0.012) {
      speed = speed * 0.4 + (acc / dtm) * 0.6;
      acc = 0;
      lastT = ctx.time;
    }
    const sp = speed;
    const seg = { x0: last.x, y0: last.y, x1: p.x, y1: p.y };
    last = p;
    const down = dy > d * 0.3;
    let touched = false;
    for (const k of knots) {
      if (k.left <= 0 || k.part !== on) continue;
      place(k);
      if (distToSegment(k.x, k.y, seg.x0, seg.y0, seg.x1, seg.y1) > k.rr + 14) continue;
      touched = true;
      if (sp > 1100) {
        // trop vite : ça tire
        tugs++;
        m.annoyed = 0.8;
        sc.shake = 0.25;
        fx.text(k.x, k.y - 30, t('mg_gknots_ouch'), '#c8463c', 18);
        ctx.hint(t('mg_gknots_gentle'), 'warn');
        break;
      }
      k.left = Math.max(0, k.left - d * (down ? 0.012 : 0.003));
      k.mesh.scale.setScalar(0.06 * S * (0.35 + 0.65 * k.left));
      if (k.left <= 0.1) {
        k.left = 0;
        k.mesh.visible = false;
        fx.burst(k.x, k.y, '✨', 4, { speed: 90, size: 16 });
        fx.text(k.x, k.y - 26, t('mg_gknots_done1'), '#2f8a5f', 20);
      }
    }
    if (touched) {
      if (down) goodLen += d;
      else badLen += d;
      if (badLen > 140 && badLen > goodLen) {
        badLen = 0;
        ctx.hint(t('mg_gknots3d_dir'), 'warn');
      }
    }
    ctx.progress(progress());
    if (knots.every((k) => k.left <= 0) && !ctx.done) {
      ctx.finish(1 - clamp(tugs / 8) * 0.5, tugs <= 1 ? t('mg_gknots_end', { name: a.name }) : undefined);
      nicker(sc);
      m.nod = 1;
      sc.frame([L.muzzle, L.poll, ...L.ears, L.tail, L.croup, ...L.hooves], { dir: [0.35, 0.18, 1], pad: 1.12, half: 0.7 });
    }
  }

  frameOn('mane');
  let started = false;
  return {
    peek: () => ({ knots: knots.filter((k) => k.left > 0).map((k) => ({ ...place(k), left: k.left, part: k.part, mesh: undefined })), tugs, on, three: true }),
    down(p) {
      last = p;
      lastT = ctx.time;
      acc = 0;
      speed = 0;
    },
    move(p, down) { if (down) work(p); },
    up() {
      last = null;
      speed = 0;
    },
    key() {},
    update(dt) {
      if (!ctx.done) sc.setFocus(40 * ctx.view.scale, sc.size.h);
      if (!started) sc.reframe(true);
      started = true;
      if (!ctx.done && on === 'mane') maneFollow.update(dt);
      const maneLeft = knots.some((k) => k.part === 'mane' && k.left > 0);
      if (!ctx.done) {
        if (!maneLeft && on === 'mane') {
          if (!saidTail) {
            saidTail = true;
            ctx.hint(t('mg_gknots3d_tail'), 'good');
          }
          frameOn('tail');
        }
      }
      // le peigne sous le doigt, contre les crins
      const pp = ctx.pointer;
      comb.visible = !ctx.done && (pp.down || pp.over);
      if (comb.visible) {
        const h = sc.pickAnimal(pp.x, pp.y);
        const at = h ? h.point.clone().addScaledVector(h.normal, 0.03) : sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.85);
        comb.position.lerp(at, Math.min(1, dt * 25));
        comb.quaternion.setFromUnitVectors(v3(0, 1, 0), h ? h.normal : sc.camera.position.clone().sub(at).normalize());
      }
      m.ears = m.annoyed > 0 ? 'back' : 'forward';
      m.look = sc.camera.position;
      m.lookAmt = 0.2;
    },
    draw(g) {
      if (!sc.ready || ctx.done) return;
      // les nœuds qui restent : un rond qui pulse, et le sens du peigne
      g.save();
      g.lineWidth = 3;
      g.font = '900 18px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const k of knots) {
        if (k.left <= 0 || k.part !== on) continue;
        place(k);
        const r = k.rr + 6 + Math.sin(ctx.time * 5) * 2;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.setLineDash([5, 5]);
        circle(g, k.x, k.y, r);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#ffffff';
        g.strokeStyle = 'rgba(60,40,20,0.5)';
        g.strokeText('↓', k.x + r + 10, k.y);
        g.fillText('↓', k.x + r + 10, k.y);
      }
      g.restore();
    },
    destroy() {
      for (const k of knots) k.mesh.parent?.remove(k.mesh);
      comb.parent?.remove(comb);
      for (const x of keep) x.dispose?.();
    },
  };
}

// ---------------------------------------------------------------- 🎀 finitions

export function gfinish3dGame(ctx) {
  const { a, t } = ctx;
  const { sc, keep, own, S, L } = setup(ctx);
  const m = sc.mood;
  m.ears = 'forward';
  // (la consigne du jeu dessiné parle d'accessoire et d'animal : ici, le ruban et les tresses)
  const hints = new Map([[t('mg_gfinish_hint'), t('mg_gfinish3d_hint', { name: a?.name, g: a?.sex })]]);
  // (le choix du jeu dessiné — accessoire et couleur — doit arriver sur le vrai cadre : le salon le lit à la fin,
  // ui/groomer.js runStep ; la logique l'écrit sur son cadre dérivé, qui passe par ce réglage)
  let choice = null;
  Object.defineProperty(ctx, 'choice', { get: () => choice, set: (v) => { choice = v; }, configurable: true, enumerable: true });
  let fxAt = null;
  const play = withLogic(ctx, finishGame, () => sc.project(fxAt ?? L.poll.clone().lerp(L.withers, 0.4)), { hints });
  const sh = play.shape;
  const B = crestBraids(sc, own, { mane: a?.look?.mane ?? a?.look?.secondary ?? 0x4a2f1d, sections: 3 });
  // (le parfum : un petit nuage blanc qui s'envole)
  const puffMat = own(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  // Cadrage : l'encolure et la crête (les tresses), la tête, de trois quarts.
  const neckPts = () => [L.withers, L.poll, ...L.ears, L.muzzle, L.chest, L.withers.clone().add(v3(-0.25 * S, -0.1 * S, 0)), L.neck.clone().add(v3(0, -0.35 * S, 0))];
  const follow = headFollow(sc, headShape(sc), neckPts, { dir: [0.35, 0.25, 1], pad: 1.25, half: 0.5, reach: 0.1 });
  follow.frame(true);
  let started = false;
  let color = null;
  let doneT = 0;
  // (la crinière rentre dans les boutons à mesure qu'on tresse, comme au jeu des tresses)
  const maneU = sc.model.hairMesh?.material?.userData?.hairBraid ?? null;
  let tuck = 0;
  return {
    peek: () => ({ ...play.peek(), knobs: B.knobs.filter((k) => k.g.visible).length, ribbon: B.knobs.some((k) => k.band.visible), color: color, tailBow: !!B.tailBow?.visible, three: true }),
    down(p) {
      if (ctx.done) return;
      const h = sc.pickAnimal(p.x, p.y);
      // (sur le cheval : un pschitt, comme sur le cheval dessiné ; à côté : « vaporise sur l'animal »)
      if (h) {
        fxAt = h.point;
        play.down({ x: sh.bx, y: sh.by });
        for (let i = 0; i < 5; i++) {
          const sp = new THREE.Sprite(puffMat);
          sp.position.copy(h.point).add(v3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06, 0.05));
          sp.scale.setScalar(0.04 * S);
          sc.spawn(sp, { life: 0.7, v: v3((Math.random() - 0.5) * 0.15, 0.12 + Math.random() * 0.1, 0.1), update: (o, k) => o.scale.setScalar(0.04 * S * (1 + k * 2)), fade: false });
        }
      } else play.down({ x: -999, y: -999 });
    },
    key: (c, d) => play.key?.(c, d),
    update(dt) {
      play.update?.(dt);
      if (!ctx.done) sc.setFocus(10 * ctx.view.scale, sc.size.h);
      if (!started) follow.frame(true);
      started = true;
      follow.update(dt);
      const s = play.peek();
      const ch = s.choice ?? {};
      if (ch.color !== color) {
        color = ch.color;
        B.ribbonMat.color.setHex(ACC_COLORS[color] ?? ACC_COLORS.pink);
      }
      // à chaque pschitt, un tiers des tresses ; le ruban de la couleur choisie (sans accessoire : pas de ruban)
      for (const k of B.knobs) {
        B.grow(k, k.sec < s.puffs, dt);
        k.band.visible = k.pom.visible = !!ch.id && k.g.visible;
      }
      if (B.tailBow) B.tailBow.visible = ch.id === 'tailBow' && s.puffs >= s.need;
      tuck += (Math.min(1, s.puffs / Math.max(1, s.need)) - tuck) * Math.min(1, dt * 3);
      if (maneU) maneU.value = tuck;
      m.look = sc.camera.position;
      m.lookAmt = 0.3;
      if (ctx.done) {
        doneT += dt;
        if (doneT <= dt) {
          nicker(sc);
          m.nod = 1;
        }
      }
    },
    draw() {},
    destroy() {
      B.remove();
      if (maneU) maneU.value = 0;
      for (const x of keep) x.dispose?.();
    },
  };
}

// ---------------------------------------------------------------- ✂️ la tonte

export function gcut3dGame(ctx) {
  const { a } = ctx;
  const { sc, keep, own, S, L, follow } = setup(ctx);
  const m = sc.mood;
  m.ears = 'forward';
  const t = ctx.t;
  const hints = new Map([[t('mg_gcut_hint'), t('mg_gcut3d_hint')]]);
  let fxAt = null;
  const play = withLogic(ctx, cutGame, () => sc.project(fxAt ?? L.body), { hints });
  const sh = play.shape;
  const F = bodyFrame(sc);
  // Le geste : un point de l'écran → le plan du milieu du cheval → le cheval dessiné (u, v du corps).
  const midZ = sc.marks.body.z;
  const to2d = (p) => {
    const ray = sc.rayAt(p.x, p.y);
    if (Math.abs(ray.direction.z) < 1e-4) return null;
    const k = (midZ - ray.origin.z) / ray.direction.z;
    const w = ray.origin.clone().addScaledVector(ray.direction, k);
    const q = sc.holder.worldToLocal(w);
    const u = ((q.z - F.z0) / (F.z1 - F.z0)) * 2 - 1;
    const vv = 1 - ((q.y - F.y0) / (F.y1 - F.y0)) * 2;
    return sh.L(u * sh.rx, vv * sh.ry);
  };
  // et l'inverse : un point du cheval dessiné (u, v) → la robe (rayon lancé depuis notre côté)
  const toCoat = (u, vv) => {
    const z = F.z0 + ((u + 1) / 2) * (F.z1 - F.z0);
    const y = F.y0 + ((1 - vv) / 2) * (F.y1 - F.y0);
    const w = sc.holder.localToWorld(v3(0, y, z));
    const hit = sc.proxy.hitAll(new THREE.Ray(v3(w.x, w.y, w.z + 3), v3(0, 0, -1)))[0];
    return hit ? hit.point : w.add(v3(0, 0, 0.3 * S));
  };
  // Le poil d'hiver : un voile plus foncé et mat sur toute la robe ; la tondeuse l'enlève en bandes.
  const coatCol = new THREE.Color(a?.look?.coat ?? 0x8a5a2b);
  const fur = coatGloss(sc, own, { additive: false, base: [coatCol.r * 0.55, coatCol.g * 0.5, coatCol.b * 0.45], alpha: 0.62, roughness: 1, env: 0, over: 99 });
  if (fur) {
    const pos = fur.positions(0);
    const q = v3();
    for (let i = 0; i < fur.count; i++) {
      q.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      sc.holder.worldToLocal(q);
      // (tout le corps, l'encolure, le haut des membres ; pas la tête ni le bas des jambes)
      const head = q.z > F.z1 + 0.25;
      if (head || q.y < F.y0 - 0.25) continue;
      // les zones à garder (coupe « concours » : le bas du corps) restent en poil d'hiver
      fur.set(i, 1.5);
    }
    fur.flush();
  }
  // Les zones à garder (vert) et à tondre (pointillés) du jeu dessiné, reposées sur la robe.
  const marks = play.tufts.filter((q) => !q.head).map((q) => ({ q, w: toCoat(q.u, q.v) }));
  // Chaque sommet du corps et les zones du jeu dessiné qui l'entourent : le poil d'hiver reste là où elles ne sont
  // pas tondues (ce qu'on voit tondu, c'est ce que le jeu compte).
  const near = [];
  if (fur) {
    const to2dW = bodyTo2d(sc, sh);
    const pos = fur.positions(0);
    const reach = 13 * Math.max(0.75, sh.s ?? 1) * 1.3;
    const w = v3();
    for (let i = 0; i < fur.count; i++) {
      if (fur.value(i) <= 0) continue;
      w.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const p2 = to2dW(w);
      const list = [];
      play.tufts.forEach((q, c) => {
        const d = Math.hypot(q.x - p2.x, q.y - p2.y);
        if (d < reach) list.push([c, 1 - d / reach]);
      });
      if (!list.length) continue;
      const sum = list.reduce((n, x) => n + x[1], 0);
      near.push([i, list.map(([c, k]) => [c, k / sum])]);
    }
  }
  let furDirty = false;
  function furFromTufts() {
    for (const [i, list] of near) {
      let v = 0;
      for (const [c, k] of list) v += (play.tufts[c].cut ? 0 : 1) * k;
      // (le poil ne repousse pas : jamais plus que ce que la tondeuse a laissé)
      fur.set(i, Math.min(fur.value(i), v > 0.55 ? 1.5 : v * 1.5));
    }
  }
  const clipper = clipperModel(own);
  clipper.scale.setScalar(1.6 * Math.max(0.8, S));
  clipper.visible = false;
  sc.scene.add(clipper);
  let last = null;
  let lastW = null;
  let started = false;
  let said = false;
  follow.frame(true);
  const concours = play.peek().style === 'concours';
  const keepAt = (x, y, z) => {
    // (un sommet d'une zone à garder : la tonte ne l'enlève pas)
    const q = sc.holder.worldToLocal(v3(x, y, z));
    const u = ((q.z - F.z0) / (F.z1 - F.z0)) * 2 - 1;
    const vv = 1 - ((q.y - F.y0) / (F.y1 - F.y0)) * 2;
    const k = Math.hypot(u, vv);
    return concours ? k <= 1 && vv > 0.25 : false;
  };
  const notKept = (i, x, y, z) => !keepAt(x, y, z);
  function clip(p) {
    if (ctx.done) return;
    const p2 = to2d(p);
    if (!p2) return;
    if (!last) {
      last = p2;
      play.down(p2);
    } else {
      play.move(p2, true);
      last = p2;
      furDirty = true;
    }
    const h = sc.pickAnimal(p.x, p.y);
    if (h && fur) {
      fxAt = h.point;
      if (lastW && lastW.distanceTo(h.point) < 0.4 * S) {
        // une bande : le long du geste
        for (let k = 0; k <= 4; k++) fur.wipe(lastW.clone().lerp(h.point, k / 4), 0.08 * S, 4, ctx.time, notKept);
      } else fur.wipe(h.point, 0.08 * S, 4, ctx.time, notKept);
      lastW = h.point;
    } else lastW = null;
  }
  return {
    peek: () => ({ ...play.peek(), three: true, marks: marks.filter((x) => !x.q.cut).map((x) => ({ ...sc.project(x.w), keep: x.q.keep })) }),
    down(p) {
      last = null;
      lastW = null;
      play.up();
      clip(p);
    },
    move(p, down) { if (down) clip(p); },
    up() {
      last = null;
      lastW = null;
      play.up();
    },
    key() {},
    update(dt) {
      play.update?.(dt);
      if (!ctx.done) sc.setFocus(56 * ctx.view.scale, sc.size.h);
      if (!started) follow.frame(true);
      started = true;
      follow.update(dt);
      if (furDirty && fur) {
        furDirty = false;
        furFromTufts();
      }
      fur?.flush();
      const pp = ctx.pointer;
      const h = !ctx.done && (pp.down || pp.over) ? sc.pickAnimal(pp.x, pp.y) : null;
      clipper.visible = !!h;
      if (h) {
        clipper.position.lerp(h.point.clone().addScaledVector(h.normal, pp.down ? 0.006 : 0.03), Math.min(1, dt * 25));
        clipper.quaternion.setFromUnitVectors(v3(0, 1, 0), h.normal);
        clipper.rotateY(Math.PI / 2);
      }
      m.look = sc.camera.position;
      m.lookAmt = 0.3;
      m.ears = pp.down && h ? 'forward' : m.ears;
      if (ctx.done && !said) {
        said = true;
        nicker(sc);
        m.nod = 1;
      }
    },
    draw(g) {
      if (!sc.ready || ctx.done) return;
      g.save();
      for (const x of marks) {
        if (x.q.cut) continue;
        const c = sc.project(x.w);
        g.strokeStyle = x.q.keep ? 'rgba(63,174,98,0.9)' : 'rgba(255,255,255,0.75)';
        g.lineWidth = x.q.keep ? 2.2 : 1.6;
        g.setLineDash(x.q.keep ? [] : [3, 3]);
        circle(g, c.x, c.y, 6);
        g.stroke();
      }
      g.restore();
    },
    destroy() {
      fur?.remove();
      clipper.parent?.remove(clipper);
      for (const x of keep) x.dispose?.();
    },
  };
}

/** La tondeuse : un boîtier arrondi, la tête de coupe argentée (origine : la lame contre le poil). */
function clipperModel(own) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.025, 0.11, 6, 14)), own(new THREE.MeshStandardMaterial({ color: 0x5b6bd8, roughness: 0.4 })));
  body.rotation.z = Math.PI / 2;
  body.position.set(-0.07, 0.03, 0);
  const head = new THREE.Mesh(own(new THREE.BoxGeometry(0.03, 0.02, 0.05)), own(new THREE.MeshStandardMaterial({ color: 0xd2d6dc, roughness: 0.25, metalness: 0.9 })));
  head.position.set(0.005, 0.012, 0);
  g.add(body, head);
  for (const o of g.children) o.castShadow = true;
  return g;
}

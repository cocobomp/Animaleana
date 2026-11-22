// Traire la chèvre ou la vache, en 3D : la logique est celle du jeu dessiné (fun.js milkGame : gauche, droite, en
// alternant, sur la musique 🎵 ; le lait doit arriver au trait vert du seau). Ici, sous le vrai animal, assis sur le
// tabouret : nos deux mains sur ses trayons (trouvés sur son modèle), chaque pression fait gicler un jet de lait
// dans le seau en inox, le lait monte, la mousse ; elle mâche tranquillement, la queue chasse les mouches ; si on se
// trompe de côté, elle piétine, oreilles couchées.

import * as THREE from 'three';
import { milkGame } from './fun.js';
import { withLogic, sideGauge } from './care3d.js';
import { emojiOpaque as emoji } from './food.js';
import { circle } from './draw.js';
import { handModel, aimHand, avatarHand } from '../../game/care/props.js';
import { milkPail, milkStool } from '../../game/care/barnProps.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Les trayons (repère monde, pose du moment) : les sommets les plus bas de la mamelle, un par quart (vache : avant
 * et arrière, à gauche et à droite) ou par moitié (chèvre : gauche et droite). Chaque trayon est un repère lié à
 * l'os de la mamelle (il suit sa respiration). Renvoie [{ tip, top, side, front }].
 */
export function findTeats(sc) {
  const px = sc.proxy;
  px.bake();
  const bones = px.skeleton?.bones ?? [];
  const pts = [];
  for (let k = 0; k < px.bones.length; k++) {
    const b = bones[px.bones[k]];
    if (b?.name === 'udder') pts.push(v3(px.pos[k * 3], px.pos[k * 3 + 1], px.pos[k * 3 + 2]));
  }
  if (pts.length < 8) return [];
  const c = pts.reduce((s, p) => s.add(p), v3()).multiplyScalar(1 / pts.length);
  const quarters = sc.a?.species === 'cow';
  const groups = new Map();
  for (const p of pts) {
    const key = `${p.z < c.z ? 'L' : 'R'}${quarters ? (p.x > c.x ? 'F' : 'B') : ''}`;
    const g = groups.get(key);
    if (!g || p.y < g.y) groups.set(key, p);
  }
  const udder = bones.find((b) => b.name === 'udder');
  const len = (quarters ? 0.06 : 0.045) * (sc.model.size ?? 1) * sc.double.scale;
  return [...groups.entries()].map(([key, tip]) => {
    const mk = new THREE.Object3D();
    mk.position.copy(tip);
    sc.scene.add(mk);
    udder?.attach(mk);
    return { key, side: key[0], front: key[1] === 'F', mk, len, tip: () => mk.getWorldPosition(v3()), top: () => mk.getWorldPosition(v3()).add(v3(0, len, 0)) };
  });
}

export function milk3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const L = sc.marks;
  const u = L.u;
  const m = sc.mood;
  m.ears = null;
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const cow = ctx.a?.species === 'cow';
  // La mamelle pleine (c'est l'heure de la traite) ; elle se vide à mesure que le lait monte dans le seau.
  const md = sc.model;
  const udder0 = Math.max(0.85, md.udderFill ?? 0.5);
  md.setUdder?.(udder0);
  sc.measure();
  // Les deux trayons qu'on trait : de notre côté (vache : l'arrière et l'avant), ou les deux de la chèvre.
  const all = findTeats(sc);
  let pair = cow ? all.filter((q) => q.side === 'R') : all;
  if (pair.length < 2) pair = all.slice(0, 2);
  // Le seau sous la mamelle, le tabouret à côté, vers nous.
  const ud = pair.length ? pair.reduce((s, q) => s.add(q.tip()), v3()).multiplyScalar(1 / pair.length) : L.udder.clone();
  // (le bord du seau sous le bout des trayons, quelle que soit sa taille : une chèvre naine, une Holstein)
  const size = Math.max(0.06, Math.min((cow ? 0.13 : 0.1) * Math.max(0.8, Math.min(1.3, u / (cow ? 1.4 : 0.8))), (ud.y - 0.06 - 0.05 * u) / 2.1));
  const pail = milkPail({ size, high: sc.high });
  pail.group.position.set(ud.x, pail.size.depth + 0.05, ud.z + 0.03 * u);
  sc.scene.add(pail.group);
  const stool = milkStool(own, Math.min(0.36, 0.22 + u * 0.08));
  stool.position.set(ud.x - 0.05, 0.04, ud.z + 0.55 + 0.25 * u);
  sc.scene.add(stool);
  const anchor = () => sc.project(pail.group.position.clone().add(v3(0, 0.05, 0)));
  // Une lumière douce sous le ventre (la lampe du trayeur) : la mamelle, à l'ombre du corps, restait noire.
  const lamp = new THREE.PointLight(0xffe2b8, 0.75 * Math.max(1, u), 2.2 * Math.max(1, u), 1.6);
  lamp.position.copy(L.udder).add(v3(0.15 * u, -0.12 * u, 0.6 * u));
  sc.scene.add(lamp);
  const play = withLogic(ctx, milkGame, anchor);
  const s0 = play.peek();
  pail.setMark(s0.lo, s0.hi, (s0.lo + s0.hi) / 2);

  // Caméra : basse, de notre côté (un peu en avant de la cuisse), à hauteur de la mamelle : le ventre, la mamelle et
  // ses trayons, nos mains, le seau et le tabouret.
  const tipPts = pair.map((q) => q.tip());
  const camDir = cow ? [0.42, 0.06, 1] : [0.55, 0.06, 1];
  const ub = L.udder.clone();
  sc.frame([...tipPts, ub.clone().add(v3(0.24 * u, 0.16 * u, 0)), ub.clone().add(v3(-0.22 * u, 0.16 * u, 0)),
    pail.group.position.clone().add(v3(0, -pail.size.depth * 0.45, 0)), pail.group.position.clone().add(v3(pail.size.r, 0, pail.size.r)), pail.group.position.clone().add(v3(-pail.size.r, 0, -pail.size.r))],
  { dir: camDir, pad: 1.12, now: true });
  // Gauche, droite : comme on les voit à l'écran.
  sc.updateCamera(0);
  pair.sort((a, b) => sc.project(a.tip()).x - sc.project(b.tip()).x);
  const teat = { L: pair[0], R: pair[1] ?? pair[0] };

  // Nos deux mains, fermées sur les trayons.
  const cols = avatarHand(sc.game?.profile);
  // (des mains à la taille des trayons : elles tiennent le haut du trayon, le bout reste visible, d'où sort le lait)
  const HS = cow ? 0.8 : 0.62;
  const hands = {};
  for (const s of ['L', 'R']) {
    const h = handModel(own, { ...cols, grip: 0.82 });
    h.scale.setScalar(HS);
    // (sans la manche : le bras vient de nous, hors de l'image ; de côté, on ne voyait que le rond bleu de la manche)
    h.traverse((o) => {
      if (o.geometry?.parameters?.height === 0.34 || o.geometry?.type === 'TorusGeometry') o.visible = false;
    });
    sc.scene.add(h);
    hands[s] = h;
  }
  // Les jets de lait : un tube blanc courbe, du bout du trayon au lait du seau.
  const jetMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.92, emissive: 0x222222 }));
  const jets = { L: null, R: null };
  const squirt = { L: 0, R: 0 };
  function makeJet(s) {
    const from = teat[s].tip();
    const to = pail.group.localToWorld(v3((s === 'L' ? -0.25 : 0.25) * pail.size.r, pail.surfaceY(), 0));
    const mid = from.clone().lerp(to, 0.5).add(v3(0, 0.02, 0));
    if (jets[s]) {
      sc.scene.remove(jets[s]);
      jets[s].geometry.dispose();
    }
    jets[s] = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 14, 0.0045 + 0.002 * u, 6), jetMat);
    sc.scene.add(jets[s]);
  }
  let hits = 0;
  let mistakes = 0;
  let wasExpect = s0.expect;
  let callIn = 4;
  return {
    peek: () => ({ ...play.peek(), teats: Object.fromEntries(Object.entries(teat).map(([k, q]) => [k, sc.project(q.tip())])) }),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      if (s.hits > hits) {
        hits = s.hits;
        squirt[wasExpect] = 0.45;
        pail.froth(0.6);
        makeJet(wasExpect);
      }
      if (s.mistakes > mistakes) {
        mistakes = s.mistakes;
        m.annoyed = 0.8;
        m.flinch = 0.5;
        sc.shake = 0.2;
      }
      wasExpect = s.expect;
      pail.setLevel(s.level);
      pail.update(dt);
      md.setUdder?.(udder0 * (1 - 0.6 * Math.min(1, s.level)), false);
      for (const side of ['L', 'R']) {
        squirt[side] = Math.max(0, squirt[side] - dt);
        if (jets[side]) jets[side].visible = squirt[side] > 0.05;
        // la main : fermée en haut du trayon ; elle presse en descendant le long du trayon (le lait sort en bas)
        const q = teat[side];
        const k = squirt[side] > 0 ? Math.sin(Math.min(1, 1 - squirt[side] / 0.45) * Math.PI) : 0;
        const top = q.top();
        const tip = q.tip();
        const at = top.clone().lerp(tip, 0.12 + 0.3 * k);
        const out = sc.camera.position.clone().sub(at).setY(0).normalize();
        const h = hands[side];
        h.position.copy(at).addScaledVector(out, 0.014 * HS);
        // (les doigts autour du trayon, depuis notre côté ; le pouce en haut)
        aimHand(h, at.clone().addScaledVector(out, 0.3).add(v3(0, -0.05, 0)), at.clone().addScaledVector(out, -0.1), false);
        h.rotateX(side === 'L' ? -0.6 : 0.6);
        h.scale.setScalar(HS * (1 - 0.06 * k));
      }
      // Elle : tranquille, elle mâche ; la queue chasse les mouches (vache) ; un meuglement, un bêlement doux.
      m.milk = true;
      m.chew = 1;
      m.still = true;
      m.look = null;
      m.lookAmt = 0;
      m.ears = m.annoyed > 0 ? 'back' : null;
      callIn -= dt;
      if (callIn <= 0) {
        callIn = 6 + Math.random() * 6;
        if (!ctx.done) callOut(sc);
      }
      if (ctx.done) m.milk = false;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // la mesure 🎵 (en haut à gauche) et sa tête (en haut à droite), comme le jeu dessiné
      const pulse = Math.max(0, 1 - Math.min(s.phase, 1 - s.phase) * 6);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, v.x0 + 44, v.y0 + 44, 26 + pulse * 6);
      g.fill();
      emoji(g, '🎵', v.x0 + 44, v.y0 + 46, 28 + pulse * 6);
      if (!ctx.done) {
        // 👇 au-dessus du trayon à presser, qui bat la mesure
        const q = sc.project(teat[s.expect].top().add(v3(0, 0.05 * u, 0)));
        g.save();
        g.globalAlpha = 0.45 + pulse * 0.55;
        g.strokeStyle = '#f2c84b';
        g.lineWidth = 5;
        circle(g, q.x, q.y + 24, 18 + pulse * 4);
        g.stroke();
        g.restore();
        emoji(g, '👇', q.x, q.y - 8, 24 + pulse * 6);
        // la jauge du lait, à côté du seau (même bande verte que celle du haut)
        const b = sc.project(pail.group.localToWorld(v3(0, -pail.size.depth, pail.size.r)));
        const t = sc.project(pail.group.localToWorld(v3(0, 0, pail.size.r)));
        const r = sc.projectRadius(pail.group.position, pail.size.r);
        sideGauge(g, Math.min(v.x1 - 24, Math.max(b.x, t.x) + r + 26), Math.min(b.y, v.y1 - 12), Math.max(70, Math.min(140, b.y - t.y)), s.level, s.lo, s.hi, { icon: '🥛', time: ctx.time });
      }
    },
    destroy() {
      sc.scene.remove(pail.group, stool, hands.L, hands.R, lamp);
      lamp.dispose();
      for (const s of ['L', 'R']) {
        if (jets[s]) {
          sc.scene.remove(jets[s]);
          jets[s].geometry.dispose();
        }
      }
      for (const q of all) q.mk.parent?.remove(q.mk);
      pail.dispose();
      m.milk = false;
      m.still = false;
      for (const x of keep) x.dispose?.();
    },
  };
}

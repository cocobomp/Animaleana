// Les mini-jeux de soin en 3D (le vrai animal dans son box : src/game/care/stage.js) : quel jeu pour quel soin,
// ouverture de la scène dans le cadre (src/ui/minigames.js), et petits outils communs (effets ancrés sur un point
// 3D, jauge le long d'un récipient, logique d'un jeu dessiné réutilisée telle quelle).
//
// Un jeu 3D a la même forme qu'un jeu dessiné ({ update, draw, down, move, up, key, peek, destroy }) ; il lit la
// scène dans ctx.scene et ne dessine en 2D que ce qui flotte par-dessus (jauges, bulles). La règle de score, les
// messages et ce que le jeu écrit dans ctx.opts.out restent ceux du jeu dessiné : pour nourrir, abreuver et la
// friandise, la logique EST celle du jeu dessiné (withLogic), seule l'image change.

import { CareStage } from '../../game/care/stage.js';
import { care3dPossible, care3dSetting } from '../../game/care/which.js';
import { stallSet } from '../../game/care/stall.js';
import { rrect, clamp } from './draw.js';
import { ration3dGame, water3dGame } from './feed3d.js';
import { treat3dGame } from './treat3d.js';
import { pet3dGame } from './pet3d.js';
import { pansage3dGame } from './pansage3d.js';

/** Soins du cheval refaits en 3D (les autres soins, et les autres espèces, gardent leur jeu dessiné). */
export const CARE3D_GAMES = {
  horse: { feed: ration3dGame, water: water3dGame, treat: treat3dGame, pet: pet3dGame, brush: pansage3dGame },
};

/** Le jeu 3D de ce soin pour cet animal, ou null. */
export function care3dGameFor(a, action) {
  return CARE3D_GAMES[a?.species]?.[action] ?? null;
}

/** Décor de chaque espèce. */
const SETS = { horse: stallSet };

/**
 * Ouvre la scène 3D dans la scène du cadre (host), sous la toile 2D (above). Renvoie la scène, ou null (WebGL
 * absent, modèle pas chargé, réglage ?care3d=off, erreur) : le cadre garde alors le jeu dessiné.
 */
export function openCareScene(ui, a, host, above) {
  if (!care3dPossible(a, { setting: care3dSetting() })) return null;
  const game = ui.game ?? null;
  let scene = null;
  try {
    scene = new CareStage({ game, a, entity: game?.entities?.get?.(a.id) ?? null, set: SETS[a.species] });
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
  // Le monde du jeu est caché derrière : on ne le dessine plus le temps du soin (Game.frame).
  ui.vxCover = (ui.vxCover ?? 0) + 1;
  scene.release = () => {
    ui.vxCover = Math.max(0, (ui.vxCover ?? 1) - 1);
  };
  return scene;
}

// ---------------------------------------------------------------- outils communs

/**
 * Logique d'un jeu dessiné réutilisée telle quelle : ses consignes, boutons, jauge, fin et note passent par le
 * vrai cadre ; ses petits effets (mots, emoji) sont reposés sur le point 3D anchor() (projeté), ses poussières
 * et gouttes (dot) sont faites en 3D par le jeu 3D. hints : Map (consigne du jeu dessiné → consigne en 3D).
 */
export function withLogic(ctx, make, anchor, { hints = null } = {}) {
  const fx = ctx.fx;
  const at = () => anchor?.() ?? { x: 200, y: 140 };
  const lctx = Object.create(ctx);
  // (une consigne qui parle du dessin — « dans le seau », alors qu'en 3D c'est une mangeoire — : remplacée)
  if (hints) lctx.hint = (text, kind) => ctx.hint(hints.get(text) ?? text, kind);
  // Les mots (« Bien ! ») à côté du point (du côté où il y a de la place), pas dessus : les cœurs et les étoiles
  // partent du point vers le haut et recouvraient le mot (« B💛n! »). Deux mots de suite : l'un au-dessus de l'autre.
  let lastText = -9;
  let stack = 0;
  lctx.fx = {
    add() {},
    dot() {},
    text(x, y, text, color, size) {
      const p = at();
      const v = ctx.view ?? { x0: 0, x1: 400, y0: 0 };
      stack = ctx.time - lastText < 0.6 ? stack + 1 : 0;
      lastText = ctx.time;
      const side = p.x > (v.x0 + v.x1) / 2 ? -1 : 1;
      const tx = Math.max(v.x0 + 60, Math.min(v.x1 - 60, p.x + side * 78));
      fx.text(tx, Math.max(v.y0 + 30, p.y - 26 - stack * 30), text, color, size);
    },
    burst(x, y, ch, n, o) {
      const p = at();
      fx.burst(p.x, p.y, ch, n, o);
    },
    float(x, y, ch, size) {
      const p = at();
      fx.float(p.x + (Math.random() - 0.5) * 30, p.y - 10, ch, size);
    },
  };
  return make(lctx);
}

/**
 * Petite jauge verticale à côté d'un récipient (filet, mangeoire, seau) : le niveau, la bande verte « juste ce
 * qu'il faut », et le trait rouge du danger (les coliques). x, y : le bas de la jauge (espace du cadre).
 */
export function sideGauge(g, x, y, h, value, lo, hi, { danger = null, icon = '', time = 0 } = {}) {
  const w = 14;
  const top = y - h;
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.strokeStyle = 'rgba(60,40,20,0.35)';
  g.lineWidth = 1.5;
  rrect(g, x - w / 2 - 3, top - 3, w + 6, h + 6, 9);
  g.fill();
  g.stroke();
  g.fillStyle = '#ece4d2';
  rrect(g, x - w / 2, top, w, h, 6);
  g.fill();
  // bande verte
  g.fillStyle = 'rgba(63,174,98,0.45)';
  g.fillRect(x - w / 2, y - h * hi, w, h * (hi - lo));
  g.strokeStyle = '#1e8a4a';
  g.lineWidth = 1.5;
  g.strokeRect(x - w / 2, y - h * hi, w, h * (hi - lo));
  // niveau
  const v = clamp(value);
  const inZone = v >= lo && v <= hi;
  g.fillStyle = danger !== null && v >= danger ? '#d0503c' : inZone ? '#3fae62' : v > hi ? '#e39a2c' : '#4a8fd8';
  rrect(g, x - w / 2 + 2, y - h * v, w - 4, Math.max(2, h * v - 2), 4);
  g.fill();
  if (danger !== null) {
    g.strokeStyle = '#c8463c';
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(x - w / 2 - 4, y - h * danger);
    g.lineTo(x + w / 2 + 4, y - h * danger);
    g.stroke();
    g.setLineDash([]);
  }
  // repère ✓ au milieu de la zone
  g.font = '900 11px system-ui, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#1e5c3e';
  g.fillText('✓', x + w / 2 + 5, y - h * (lo + hi) / 2);
  if (icon) {
    g.font = '16px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#000';
    g.fillText(icon, x, top - 14 + Math.sin(time * 3) * 1.5);
  }
  g.restore();
}

/** Bulle douce (« Miam ! ») au-dessus d'un point de l'espace du cadre. */
export function bubble(g, x, y, text, { bg = 'rgba(255,255,255,0.92)', fg = '#3a2a1a', size = 15 } = {}) {
  g.save();
  g.font = `800 ${size}px system-ui, sans-serif`;
  const w = g.measureText(text).width + 18;
  const h = size + 12;
  g.fillStyle = bg;
  g.shadowColor = 'rgba(0,0,0,0.18)';
  g.shadowBlur = 6;
  rrect(g, x - w / 2, y - h, w, h, h / 2);
  g.fill();
  g.shadowBlur = 0;
  g.beginPath();
  g.moveTo(x - 6, y - 1);
  g.lineTo(x, y + 6);
  g.lineTo(x + 6, y - 1);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y - h / 2);
  g.restore();
}

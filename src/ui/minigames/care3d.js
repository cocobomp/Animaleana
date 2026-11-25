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
import { wash3dGame } from './wash3d.js';
import { HORSE_PLUS_GAMES } from './horsePlus3d.js'; // (seller, brider, vermifuge, maréchal, curer le box)
export { openChoreScene, chore3dGameFor } from './chores3d.js'; // (les corvées : le box, l'allée, sans animal)
import { PetStage } from '../../game/care/petStage.js'; // chiens, chats, lapins : leur scène, leurs décors, leurs soins
import { homeSet } from '../../game/care/home.js';
import { hutchSet } from '../../game/care/hutch.js';
import { PET_CARE3D_GAMES } from './pets3d.js';
import { barnSet } from '../../game/care/farmBarn.js'; // la bergerie, la chèvrerie, l'étable
import { RUMINANT_FIT } from '../../game/care/ruminant.js'; // moutons, chèvres, vaches : leurs repères, leur vie
import { farmFeed3dGame, farmWater3dGame } from './farm3d.js';
import { farmTreat3dGame } from './farmTreat3d.js';
import { farmPet3dGame } from './farmPet3d.js';
import { farmBrush3dGame } from './farmBrush3d.js';
import { shear3dGame } from './shear3d.js';
import { milk3dGame } from './milk3d.js';
import { cowWash3dGame } from './cowWash3d.js';
import { shine3dGame, braid3dGame, gdry3dGame, gknots3dGame, gfinish3dGame, gcut3dGame } from './horseBeauty3d.js'; // (concours de beauté et salon de toilettage du cheval)
import { hoofTrim3dGame } from './hoofTrim3d.js';
import { goatPlay3dGame } from './goatPlay3d.js';
import { barnClean3dGame } from './barnClean3d.js';
import { lunge3dGame, liberty3dGame } from './lunge3d.js'; // (longe et liberté dans le rond de longe)
import { whereFacts, settingFrom, gameAmbience, pickExtras, pickLife, hashSeed, awayLook, extrasPlace, AWAY_LOOKS } from '../../game/care/setting.js'; // (le vrai lieu, l'heure, la météo)
import { dressDecor } from '../../game/care/dress.js'; // (le lieu du voyage, l'ambiance, les objets du jour)

/** Soins du cheval refaits en 3D (les autres soins, et les autres espèces, gardent leur jeu dessiné). */
export const CARE3D_GAMES = {
  horse: { feed: ration3dGame, water: water3dGame, treat: treat3dGame, pet: pet3dGame, brush: pansage3dGame, wash: wash3dGame },
};
Object.assign(CARE3D_GAMES.horse, HORSE_PLUS_GAMES);
Object.assign(CARE3D_GAMES, PET_CARE3D_GAMES); // (chien, chat, lapin : src/ui/minigames/pets3d.js)
// Moutons, chèvres, vaches (src/ui/minigames/farm3d.js et suivants).
for (const sp of ['sheep', 'goat', 'cow']) CARE3D_GAMES[sp] = { feed: farmFeed3dGame, water: farmWater3dGame, treat: farmTreat3dGame, pet: farmPet3dGame, brush: farmBrush3dGame };
CARE3D_GAMES.sheep.shear = shear3dGame;
CARE3D_GAMES.goat.milk = milk3dGame;
CARE3D_GAMES.cow.milk = milk3dGame;
Object.assign(CARE3D_GAMES.horse, { shine: shine3dGame, braid: braid3dGame, gdry: gdry3dGame, gknots: gknots3dGame, gfinish: gfinish3dGame, gcut: gcut3dGame });
CARE3D_GAMES.cow.wash = cowWash3dGame;
CARE3D_GAMES.goat.nails = hoofTrim3dGame; // (parer les onglons : le pied levé, hoofTrim3d.js)
CARE3D_GAMES.goat.play = goatPlay3dGame; // (la balle dans le pré : goatPlay3d.js, paddock.js)
CARE3D_GAMES.cow.clean = barnClean3dGame; // (nettoyer l'étable : les bouses, la brouette, la paille : barnClean3d.js)
Object.assign(CARE3D_GAMES.horse, { lunge: lunge3dGame, liberty: liberty3dGame }); // (le rond de longe : lunge3d.js)

/** Le jeu 3D de ce soin pour cet animal, ou null. */
export function care3dGameFor(a, action) {
  return CARE3D_GAMES[a?.species]?.[action] ?? null;
}

/** Décor de chaque espèce. */
const SETS = { horse: stallSet, sheep: barnSet, goat: barnSet, cow: barnSet };
Object.assign(SETS, { dog: homeSet, cat: homeSet, rabbit: hutchSet }); // (le coin de la maison, le clapier)
/** Les lieux dehors de chaque décor : le pré (cheval, bétail), le jardin (chien, chat), l'enclos sur l'herbe (lapin). */
const OUTSIDE = { pre: true, jardin: true, enclos: true, ailleurs: true };

/**
 * Le décor d'un soin : celui de l'espèce, dans le vrai lieu de l'animal (place : careSetting), à l'heure et sous le
 * temps du jeu (amb : careAmbience), avec les objets du jour (kinds : pickExtras) et le petit plus du lieu (life :
 * pickLife) ; en voyage, le fond du lieu (look : awayLook). dress : de quoi habiller un autre décor le temps d'un jeu
 * (la balle au pré, la longe au rond) ; gardé dans decor.dress. Renvoie set(stage) → décor.
 */
export function decorFor(species, place, { amb = null, kinds = [], life = [], seed = 1, look = null, dress = null } = {}) {
  const base = SETS[species] ?? stallSet;
  const opts = { season: amb?.season ?? 'summer' };
  if (OUTSIDE[place]) {
    if (species === 'rabbit') opts.grass = true;
    else opts.outdoor = true;
  }
  // (en voyage, le chien, le chat et le lapin n'ont ni la façade de la maison ni le clapier de la ferme : une clôture
  // basse, et le fond du lieu derrière ; un lieu inconnu garde le jardin habituel)
  if (place === 'ailleurs' && AWAY_LOOKS[look]) opts.travel = true;
  return (stage) => {
    const d = base(stage, opts);
    d.place = place;
    d.dress = dress ?? (amb ? { amb, seed, species } : null);
    return dressDecor(stage, d, { amb, kinds, life, seed, look: place === 'ailleurs' ? look : null });
  };
}

/**
 * Le décor de ce soin pour cet animal, dans le jeu (lieu, heure, météo, objets du jour, lieu du voyage). travel : la
 * famille du lieu du voyage quand on y est avec lui, quel que soit le lieu du soin (la balle de la chèvre, la longe :
 * leur pré et leur rond prennent aussi le décor du lieu, dressOther).
 */
export function careDecor(game, a, action = null) {
  const amb = gameAmbience(game);
  let facts = { known: false };
  let day = 1;
  try {
    facts = whereFacts(game, a);
    day = game?.day ?? 1;
  } catch {
    day = 1;
  }
  const place = settingFrom(a?.species, facts, action);
  const travel = facts.known && facts.here && facts.away ? awayLook(facts.placeId) : null;
  const look = place === 'ailleurs' ? travel : null;
  const id = a?.id ?? '';
  const species = a?.species;
  const kinds = pickExtras({ day, id, place: extrasPlace(place, look), species, n: 3, amb });
  const life = pickLife({ day, id, place, amb, species, taken: kinds });
  const seed = hashSeed(`${day}|${id}`) % 100000;
  const dress = { amb, day, id, species, seed, look, travel };
  return { place, amb, kinds, life, look, travel, set: decorFor(species, place, { amb, kinds, life, seed, look, dress }) };
}

/**
 * Le lieu du voyage où l'animal est emmené (sa famille : AWAY_LOOKS), d'après decor.dress du décor du soin, ou null (à
 * la ferme, lieu inconnu, pas d'ambiance). Le pré de la balle et le rond de longe le lisent pour laisser leurs
 * bâtiments de la ferme à la ferme (paddockSet, roundPenSet : travel).
 */
export function travelLook(dress) {
  return dress?.amb && AWAY_LOOKS[dress.travel] ? dress.travel : null;
}

/**
 * Habille un décor qu'un jeu met lui-même à la place de celui du soin (le pré de la balle, le rond de longe) avec la
 * même heure, la même météo et la même saison, et les objets du jour de ce lieu (place : 'pre'). En voyage
 * (dress.travel), c'est le lieu du voyage : son fond (away.js), ses objets du jour. dress : decor.dress du décor du soin
 * (careDecor) ; sans lui (tests, jeu dessiné), rien ne change. anywhere : la caméra tourne avec l'animal (placeExtras ;
 * le fond du lieu se pose alors tout autour). Renvoie le décor.
 */
export function dressOther(stage, d, dress, place = 'pre', { anywhere = false } = {}) {
  if (!dress?.amb) return d;
  const { amb, day = 1, id = '', species = '', seed = 1 } = dress;
  const look = travelLook(dress);
  const where = look ? 'ailleurs' : place;
  const kinds = pickExtras({ day, id, place: extrasPlace(where, look), species, n: 3, amb });
  const life = pickLife({ day, id, place: where, amb, species, taken: kinds });
  d.place = where;
  d.dress = dress;
  return dressDecor(stage, d, { amb, kinds, life, seed: seed + 17, anywhere, look });
}

/** Scène de chaque espèce (celle du cheval par défaut ; chien, chat, lapin : PetStage, leurs repères et leur vie). */
const STAGES = { dog: PetStage, cat: PetStage, rabbit: PetStage };
/** Adaptation de la scène aux espèces dont le modèle n'est pas celui du cheval (CareStage, o.fit). */
const FITS = { sheep: RUMINANT_FIT, goat: RUMINANT_FIT, cow: RUMINANT_FIT };

/**
 * Ouvre la scène 3D dans la scène du cadre (host), sous la toile 2D (above). Renvoie la scène, ou null (WebGL
 * absent, modèle pas chargé, réglage ?care3d=off, erreur) : le cadre garde alors le jeu dessiné.
 */
export function openCareScene(ui, a, host, above, action = null) {
  if (!care3dPossible(a, { setting: care3dSetting() })) return null;
  const game = ui.game ?? null;
  let scene = null;
  const fit = FITS[a.species] ?? null;
  let model = null;
  try {
    model = fit?.model?.(a) ?? null;
    // (le décor du vrai lieu de l'animal, à l'heure et sous le temps du jeu : careDecor)
    const decor = careDecor(game, a, action);
    scene = new (STAGES[a.species] ?? CareStage)({ game, a, entity: game?.entities?.get?.(a.id) ?? null, set: decor.set, fit, model });
  } catch (e) {
    console.warn('[care3d] scène 3D impossible, jeu dessiné', e?.message ?? e);
    try {
      scene?.dispose();
      // (le double construit par l'adaptation avant la scène — WebGL refusé avant qu'elle le prenne — : libéré)
      fit?.drop?.(model);
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

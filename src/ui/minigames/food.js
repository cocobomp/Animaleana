// Mini-jeux « repas » : nourrir, donner à boire, donner une friandise.

import { drawAnimal, animalShape, rrect, ellipse, circle, emoji as emojiRaw, label, fillView, clamp, lerp, shade } from './draw.js';
import { quirksOf, knows } from '../../sim/horseQuirks.js'; // 🔍 sa friandise préférée (cheval)
import { keepsMemories } from '../../sim/memories.js'; // (tes chevaux : pas ceux qu'on te confie)

/**
 * emoji() de draw.js, mais toujours bien opaque : sur un canvas, un emoji en couleur prend
 * l'opacité du fillStyle courant (après un remplissage translucide, il serait tout pâle).
 */
export function emojiOpaque(g, ...args) {
  g.save();
  g.fillStyle = '#000';
  emojiRaw(g, ...args);
  g.restore();
}
const emoji = emojiOpaque;

/**
 * Typographie française sans « ! » orphelin : l'espace avant « ! ? : ; » et après « « » devient
 * insécable. Sur un téléphone (390 px), « Oh oui, juste là ! C'est son endroit préféré ! »
 * laissait sinon le dernier « ! » tout seul sur la deuxième ligne de la consigne.
 */
export const nb = (s) => String(s).replace(/ ([!?:;»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

/**
 * Libellé du bouton « ✅ C'est bon ! » avec une espace insécable avant « ! » : sur un bouton
 * étroit (deux boutons côte à côte en 360 px), le « ! » ne part pas seul à la ligne.
 */
export const stopLabel = (t) => nb(`✅ ${t('mg_stopHere')}`);

/** Messages de fin « juste / trop peu / trop » (pour ctx.finishJust), sans « ! » orphelin. */
export const justMsgs = (t, name) => ({
  just: nb(t('mg_justRight', { name })),
  low: nb(t('mg_tooLittle', { name })),
  high: nb(t('mg_tooMuch', { name })),
});

/**
 * Dessine un animal qui saute ou rebondit de `lift` au-dessus du sol. drawAnimal({ lift })
 * étire les pattes jusqu'au sol (le chat qui bondit sur la plume était monté sur des échasses,
 * le lapin impatient aussi) : ici l'animal entier monte, pattes comprises, et une ombre reste
 * au sol, plus petite quand il est haut. Renvoie la forme (animalShape), comme drawAnimal.
 */
export function drawAnimalLifted(g, a, o, lift = 0) {
  if (lift > 0.5) {
    const sh0 = animalShape(a, { ...o, lift: 0 });
    const k = 1 / (1 + lift / 60);
    g.save();
    g.fillStyle = `rgba(0, 0, 0, ${(0.16 * k).toFixed(3)})`;
    ellipse(g, sh0.bx, (o.y ?? 300) + 2, sh0.rx * 1.1 * k, 8 * (o.s ?? 1) * k);
    g.fill();
    g.restore();
  }
  // (shadow: false : drawAnimal dessine encore son ombre sous les pattes, donc en l'air ;
  // l'option est demandée dans draw.js, fichier partagé, et ne change rien d'ici là.)
  return drawAnimal(g, a, { ...o, y: (o.y ?? 300) - Math.max(0, lift), lift: 0, ...(lift > 0.5 ? { shadow: false } : {}) });
}

const BIG = ['horse', 'cow', 'sheep', 'goat'];
export const isBig = (a) => BIG.includes(a.species);

/** Taille de l'animal pour qu'il tienne bien dans la scène. */
export function sizeFor(a, k = 1) {
  return ({ dog: 0.85, cat: 0.95, rabbit: 0.9, horse: 0.6, cow: 0.6, sheep: 0.72, goat: 0.72 }[a.species] ?? 0.8) * k;
}

/** Décor : cuisine (petits animaux) ou grange (grands animaux). */
export function homeBackground(g, ctx, floorY = 300) {
  const v = ctx.view;
  if (isBig(ctx.a)) {
    fillView(g, v, '#b07a4c', '#9a6740');
    g.strokeStyle = 'rgba(70, 40, 20, 0.35)';
    g.lineWidth = 3;
    for (let x = Math.floor(v.x0 / 46) * 46; x < v.x1; x += 46) {
      g.beginPath(); g.moveTo(x, v.y0); g.lineTo(x, floorY); g.stroke();
    }
    g.fillStyle = '#e2c46e';
    g.fillRect(v.x0, floorY, v.w, v.y1 - floorY);
    g.strokeStyle = 'rgba(150, 110, 30, 0.5)';
    g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = v.x0 + ((i * 67) % Math.ceil(v.w));
      const y = floorY + 6 + ((i * 29) % Math.max(1, Math.ceil(v.y1 - floorY - 8)));
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y - 4 + (i % 3) * 3); g.stroke();
    }
  } else {
    fillView(g, v, '#fbe9cf', '#f6dcb8');
    // frise
    g.fillStyle = '#f0c98f';
    g.fillRect(v.x0, floorY - 70, v.w, 10);
    g.fillStyle = '#c98f5a';
    g.fillRect(v.x0, floorY, v.w, v.y1 - floorY);
    g.strokeStyle = 'rgba(90, 50, 20, 0.25)';
    g.lineWidth = 2;
    for (let y = floorY + 16; y < v.y1; y += 18) { g.beginPath(); g.moveTo(v.x0, y); g.lineTo(v.x1, y); g.stroke(); }
  }
  g.fillStyle = 'rgba(0,0,0,0.1)';
  g.fillRect(v.x0, floorY, v.w, 4);
}

// ---------------------------------------------------------------- verser (nourriture et eau)

const FOOD = {
  dog: { bits: ['#8a5a2b', '#a06a35', '#6f4520'], kind: 'kibble', label: 'mg_food_kibble' },
  cat: { bits: ['#b36b3a', '#8f4f2a', '#c98a52'], kind: 'kibble', label: 'mg_food_kibble' },
  rabbit: { bits: ['#c9b458', '#f08a24', '#a8b84a'], kind: 'mix', label: 'mg_food_rabbit' },
  horse: { bits: ['#d6c060', '#b9a24a', '#a5713a'], kind: 'hay', label: 'mg_food_horse' },
  sheep: { bits: ['#d6c060', '#bfae52', '#a8b84a'], kind: 'hay', label: 'mg_food_hay' },
  goat: { bits: ['#d6c060', '#bfae52', '#a8b84a'], kind: 'hay', label: 'mg_food_hay' },
  cow: { bits: ['#d6c060', '#bfae52', '#a8b84a'], kind: 'hay', label: 'mg_food_hay' },
};

/** En dessous, « C'est bon ! » reste grisé : une simple tape qui n'a presque rien versé n'est pas une décision. */
const MIN_POUR = 0.05;

function pourGame(ctx, water) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind);
  const big = isBig(a);
  const food = FOOD[a.species] ?? FOOD.dog;
  const floorY = 300;
  // Récipient : gamelle, mangeoire ou seau
  // (la cible 🎯 dessinée à droite du récipient doit tenir dans les 400 px du cadre)
  const box = water
    ? (big ? { x: 290, w: 110, h: 100, kind: 'bucket' } : { x: 285, w: 120, h: 56, kind: 'bowl' })
    : (big ? { x: 272, w: 170, h: 62, kind: 'trough' } : { x: 285, w: 130, h: 58, kind: 'bowl' });
  box.bottom = floorY + 6;
  box.top = box.bottom - box.h;
  // « Juste ce qu'il faut » : entre la moitié et les trois quarts du récipient (1 = plein),
  // avec une zone verte de ± 0,12 autour, visible sur la jauge et sur le récipient.
  // On verse en gardant le doigt appuyé (en plusieurs fois si on veut), puis on appuie sur
  // « ✅ C'est bon ! ». Trop peu OU trop : moins de points, de la même façon des deux côtés
  // (score.js). Si ça déborde, c'est trop, et c'est fini tout de suite.
  const target = 0.6 + ctx.rng() * 0.16;
  const band = 0.12;
  const lo = target - band;
  const hi = target + band;
  const s = sizeFor(a);
  const animalX = big ? 110 : 125;
  const mouthOff = animalShape(a, { x: animalX, y: floorY, s, f: 1 }).mouth.x - animalX;
  const eatTarget = Math.max(0, box.x - box.w * 0.3 - animalX - mouthOff);

  let level = 0; // ce qui est déjà dans le récipient (0 = vide, 1 = plein)
  let inFlight = 0; // ce qui tombe encore (ça va atterrir : la jauge le compte déjà)
  let pouring = false;
  let holdTime = 0;
  let spawn = 0;
  let released = false; // on vient de lâcher : la consigne dira quoi faire ensuite
  let finishing = false; // « C'est bon ! » appuyé : on finit dès que tout est tombé
  let flow = 0;
  let eatX = 0;
  const drops = [];
  const pile = [];
  const value = () => Math.min(1, level + inFlight);

  const surfaceY = () => box.bottom - 6 - level * (box.h - 10);
  const sourceX = box.x + (water ? 22 : -8);
  const sourceY = water ? 96 : 108;

  hint(t(water ? 'mg_water_hint' : 'mg_feed_hint'));
  ctx.zone(lo, hi);
  // (🥣 / 🌾 plutôt que 🫗, trop récent : il ne s'affiche pas sur les tablettes un peu anciennes)
  ctx.button(`${water ? '🚰' : big ? '🌾' : '🥣'} ${t(water ? 'mg_water_btn' : 'mg_feed_btn')}`, {
    hold: true, cls: 'primary', onDown: () => start(), onUp: () => stop(),
  });
  // « C'est bon ! » : c'est lui qui termine, dès que quelque chose a été versé.
  const stopBtn = ctx.stopButton(() => askEnd(), stopLabel(t));
  stopBtn.disabled = true;
  const canStop = () => !ctx.done && !pouring && !finishing && value() >= MIN_POUR;

  function start() {
    if (ctx.done || finishing) return;
    pouring = true;
    released = false;
    holdTime = 0;
  }
  /** Lâcher arrête de verser ; on peut reprendre, ou appuyer sur « C'est bon ! ». */
  function stop() {
    if (!pouring) return;
    pouring = false;
    released = true;
  }
  /** « C'est bon ! » : on attend que tout soit tombé, puis on compte ce qu'il y a dans le récipient. */
  function askEnd() {
    if (!canStop()) return;
    finishing = true;
  }

  /** Fin : tous les points dans la zone verte, un peu moins si c'est un peu trop peu ou un peu trop. */
  function end() {
    if (ctx.done) return;
    const v = value();
    const { verdict: why } = ctx.finishJust(v, lo, hi, { who: a.name, msgs: justMsgs(t, a.name) });
    if (why === 'just') {
      fx.text(box.x, box.top - 30, t('mg_perfect'), '#2f8a5f', 26);
      fx.burst(box.x, box.top, '✨', 6);
    } else if (why === 'low') {
      fx.text(box.x, box.top - 30, t('mg_more_short'), '#c07a10', 26);
    } else {
      fx.text(box.x, box.top - 30, t('mg_oops'), '#c8463c', 26);
    }
  }

  return {
    peek: () => ({ level, inFlight, value: value(), lo, hi, target, pouring, finishing, canStop: canStop() }),
    down() { start(); },
    up() { stop(); },
    key(code, down) {
      // Espace : verser (garder appuyé) ; Entrée : « C'est bon ! ».
      if (code === 'Space') {
        if (down) start();
        else stop();
      } else if (down && (code === 'Enter' || code === 'NumpadEnter')) askEnd();
    },
    update(dt) {
      if (pouring) {
        holdTime += dt;
        // L'eau coule de plus en plus fort ; les croquettes à vitesse régulière.
        flow = water ? 0.1 + 0.22 * clamp(holdTime / 1.5) : 0.22;
        spawn += dt * (water ? 40 : 16);
        while (spawn > 1) {
          spawn -= 1;
          drops.push({
            x: sourceX + (Math.random() - 0.5) * (water ? 4 : 16),
            y: sourceY,
            vy: water ? 200 : 70,
            vx: (Math.random() - 0.5) * (water ? 6 : 30),
            amount: flow / (water ? 40 : 16),
            c: food.bits[Math.floor(Math.random() * food.bits.length)],
            r: water ? 3 + Math.random() * 2 : 4 + Math.random() * 2,
            rot: Math.random() * 3,
          });
        }
      }
      const sy = surfaceY();
      for (const d of drops) {
        d.vy += 900 * dt;
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y >= sy) {
          d.dead = true;
          level = Math.min(1, level + d.amount);
          if (water) {
            if (Math.random() < 0.3) fx.dot(d.x, sy, 'rgba(180,225,255,0.9)', 2.5, { vx: (Math.random() - 0.5) * 80, vy: -80 - Math.random() * 60, grav: 500, life: 0.4 });
          } else if (pile.length < 160) {
            pile.push({ dx: (Math.random() - 0.5) * 2, k: Math.random(), c: d.c, r: d.r, rot: d.rot });
          }
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
      inFlight = drops.reduce((sum, d) => sum + d.amount, 0);

      if (!ctx.done) {
        const v = value();
        ctx.progress(v);
        stopBtn.disabled = !canStop();
        if (v >= 1) {
          // Ça déborde : trop, et c'est fini.
          level = 1;
          inFlight = 0;
          drops.length = 0;
          pouring = false;
          fx.burst(box.x, box.top, water ? '💦' : '🍂', 8);
          end();
        } else if (finishing) {
          if (drops.length === 0) end();
        } else if (pouring && v > hi) {
          hint(t('mg_stop'), 'warn');
        } else if (pouring && v >= lo) {
          hint(t('mg_nowStop'), 'good');
        } else if (pouring) {
          hint(t(water ? 'mg_water_hint' : 'mg_feed_hint'));
        } else if (released) {
          // On vient de lâcher : on dit où on en est (encore un peu, c'est bon, ou un peu trop) ;
          // ce qui tombe encore est déjà compté.
          released = false;
          if (v < lo) hint(t('mg_more'), 'warn');
          else if (v <= hi) hint(`✅ ${t('mg_stopHere')}`, 'good');
          else hint(t('mg_tooMuch', { name: a.name }), 'warn');
        }
      } else {
        // L'animal vient manger / boire.
        eatX = Math.min(eatX + dt * 90, eatTarget);
        if (Math.random() < dt * 4) fx.float(box.x + (Math.random() - 0.5) * 40, box.top - 10, water ? '💧' : '😋', 18);
      }
    },
    draw(g) {
      homeBackground(g, ctx, floorY);
      // Récipient
      drawContainer(g, box, level, water, food, pile, lo, hi, target, ctx);
      // Animal (il regarde le récipient)
      const eating = ctx.done && eatX >= eatTarget - 1;
      drawAnimal(g, a, { x: animalX + eatX, y: floorY, s, f: 1, headDip: eating ? 0.6 + Math.sin(ctx.time * 8) * 0.08 : 0, mouth: eating, wag: !ctx.done ? level > 0.2 : true, walk: ctx.done && eatX < eatTarget - 1 ? ctx.time * 10 : null, happy: eating });
      // Source : sac ou robinet
      if (water) drawTap(g, box, pouring, flow);
      else drawBag(g, sourceX, sourceY, pouring, t(food.label), ctx.time);
      // Chute
      for (const d of drops) {
        if (water) {
          g.fillStyle = 'rgba(90, 170, 240, 0.85)';
          ellipse(g, d.x, d.y, d.r * 0.8, d.r * 1.6);
          g.fill();
        } else drawBit(g, food.kind, d.x, d.y, d.r, d.c, d.rot);
      }
      if (water && pouring) {
        g.fillStyle = 'rgba(110, 185, 245, 0.55)';
        const w = 3 + flow * 14;
        g.fillRect(sourceX - w / 2, sourceY, w, surfaceY() - sourceY);
      }
    },
  };
}

function drawBit(g, kind, x, y, r, c, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = c;
  if (kind === 'hay' || (kind === 'mix' && c !== '#f08a24')) {
    g.strokeStyle = c;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r * 2, 0);
    g.lineTo(r * 2, r * 0.6);
    g.moveTo(-r * 1.6, r);
    g.lineTo(r * 1.8, -r * 0.3);
    g.stroke();
  } else if (kind === 'mix') {
    // morceau de carotte
    g.beginPath();
    g.moveTo(-r * 1.6, -r * 0.6);
    g.lineTo(r * 1.6, 0);
    g.lineTo(-r * 1.6, r * 0.6);
    g.closePath();
    g.fill();
  } else {
    ellipse(g, 0, 0, r, r * 0.8);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    circle(g, -r * 0.3, -r * 0.3, r * 0.3);
    g.fill();
  }
  g.restore();
}

function drawContainer(g, box, level, water, food, pile, lo, hi, target, ctx) {
  const { x, w, h, top, bottom, kind } = box;
  const innerH = h - 10;
  const yOf = (lv) => bottom - 6 - lv * innerH;
  // Corps
  g.save();
  let shape;
  if (kind === 'bowl') {
    shape = () => {
      g.beginPath();
      g.moveTo(x - w / 2, top);
      g.lineTo(x + w / 2, top);
      g.lineTo(x + w / 2 - 14, bottom);
      g.lineTo(x - w / 2 + 14, bottom);
      g.closePath();
    };
  } else if (kind === 'bucket') {
    shape = () => {
      g.beginPath();
      g.moveTo(x - w / 2, top);
      g.lineTo(x + w / 2, top);
      g.lineTo(x + w / 2 - 10, bottom);
      g.lineTo(x - w / 2 + 10, bottom);
      g.closePath();
    };
  } else {
    shape = () => rrect(g, x - w / 2, top, w, h, 6);
  }
  // Intérieur (fond)
  shape();
  g.fillStyle = kind === 'trough' ? '#6b4426' : kind === 'bucket' ? '#7d8a94' : '#d8dfe6';
  g.fill();
  // Contenu
  g.save();
  shape();
  g.clip();
  const sy = yOf(level);
  if (water) {
    const gr = g.createLinearGradient(0, sy, 0, bottom);
    gr.addColorStop(0, 'rgba(120, 195, 250, 0.95)');
    gr.addColorStop(1, 'rgba(40, 120, 210, 0.95)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - w, bottom + 5);
    for (let i = 0; i <= 20; i++) {
      const px = x - w / 2 + (i / 20) * w;
      g.lineTo(px, sy + Math.sin(ctx.time * 6 + i * 0.8) * (level > 0 ? 2 : 0));
    }
    g.lineTo(x + w, bottom + 5);
    g.closePath();
    g.fill();
  } else if (level > 0) {
    // Petit tas bombé
    g.fillStyle = food.bits[0];
    g.beginPath();
    g.moveTo(x - w, bottom + 5);
    g.lineTo(x - w / 2, sy + 8);
    g.quadraticCurveTo(x, sy - 10, x + w / 2, sy + 8);
    g.lineTo(x + w, bottom + 5);
    g.closePath();
    g.fill();
    for (const p of pile) {
      const px = x + (p.k - 0.5) * w * 0.9;
      const py = lerp(sy + 4, bottom, ((p.k * 7.3) % 1)) - Math.cos((p.k - 0.5) * 3) * 6;
      drawBit(g, food.kind, px, py, p.r, p.c, p.rot);
    }
  }
  g.restore();
  // Zone verte « juste ce qu'il faut » sur le récipient, avec la ligne 🎯 au milieu et un ✓
  const yl = yOf(lo);
  const yh = yOf(hi);
  g.fillStyle = 'rgba(63, 174, 98, 0.32)';
  g.fillRect(x - w / 2 - 8, yh, w + 16, yl - yh);
  g.strokeStyle = '#1e8a4a';
  g.lineWidth = 2;
  g.strokeRect(x - w / 2 - 8, yh, w + 16, yl - yh);
  g.setLineDash([6, 5]);
  g.strokeStyle = '#1e7a40';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x - w / 2 - 10, yOf(target));
  g.lineTo(x + w / 2 + 10, yOf(target));
  g.stroke();
  g.setLineDash([]);
  emoji(g, '🎯', x + w / 2 + 22, yOf(target), 22);
  label(g, '✓', x - w / 2 - 20, yOf(target), 22, '#1e5c3e');
  // Bord avant
  g.lineWidth = 5;
  g.strokeStyle = kind === 'trough' ? '#4a2c16' : kind === 'bucket' ? '#5d6870' : '#3c7bd9';
  shape();
  g.stroke();
  if (kind === 'bowl') {
    g.fillStyle = water ? '#3c7bd9' : '#e0574a';
    g.fillRect(x - w / 2 + 6, bottom - 12, w - 12, 8);
  }
  if (kind === 'bucket') {
    g.strokeStyle = '#5d6870';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, top, w / 2, Math.PI, 0);
    g.stroke();
  }
  if (kind === 'trough') {
    g.fillStyle = '#4a2c16';
    g.fillRect(x - w / 2 + 8, bottom - 2, 12, 10);
    g.fillRect(x + w / 2 - 20, bottom - 2, 12, 10);
  }
  g.restore();
}

function drawBag(g, x, y, pouring, text, time) {
  g.save();
  g.translate(x + 40, y - 40);
  const tilt = pouring ? -1.0 + Math.sin(time * 20) * 0.03 : -0.25;
  g.rotate(tilt);
  // sac
  g.fillStyle = '#e7d3a6';
  rrect(g, -38, -45, 76, 90, 10);
  g.fill();
  g.strokeStyle = '#b89a5e';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = '#e0574a';
  rrect(g, -30, -12, 60, 30, 6);
  g.fill();
  emoji(g, '🐾', 0, 3, 20);
  g.fillStyle = '#c9b07a';
  g.fillRect(-38, -50, 76, 10);
  g.restore();
  label(g, text, x + 40, y - 94, 14, '#6b4426');
}

function drawTap(g, box, pouring, flow) {
  const x = box.x + 22;
  g.save();
  // tuyau
  g.fillStyle = '#9aa7b1';
  g.fillRect(x - 6, 40, 120, 18);
  g.fillRect(x - 10, 50, 22, 40);
  g.fillStyle = '#7d8a94';
  rrect(g, x - 14, 84, 28, 14, 4);
  g.fill();
  // poignée qui tourne
  g.translate(x + 2, 34);
  g.rotate(pouring ? -0.9 * (0.4 + flow * 2) : 0);
  g.fillStyle = '#3c7bd9';
  rrect(g, -26, -7, 52, 14, 7);
  g.fill();
  g.fillStyle = '#e0574a';
  circle(g, 0, 0, 8);
  g.fill();
  g.restore();
}

export const feedGame = (ctx) => pourGame(ctx, false);
export const waterGame = (ctx) => pourGame(ctx, true);

// ---------------------------------------------------------------- friandise

const TREATS = { dog: '🦴', cat: '🐟', rabbit: '🥕', horse: '🍎', cow: '🌽', goat: '🥬', sheep: '🍏' };
/** Cheval : carotte ou pomme (il a sa préférée, src/sim/horseQuirks.js). */
const HORSE_TREATS = { carrot: '🥕', apple: '🍎' };

/** Main tendue (paume à plat) qui tient une friandise. */
export function drawHand(g, x, y, s = 1, flat = true, skin = '#f0c29a') {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = '#5b8fd9';
  rrect(g, 34, -12, 50, 26, 6);
  g.fill();
  g.fillStyle = skin;
  ellipse(g, 6, 2, 34, 14, flat ? 0 : -0.3);
  g.fill();
  // doigts
  for (let i = 0; i < 4; i++) {
    ellipse(g, -26 + i * 2, -6 + i * 5, 14, 5, flat ? 0.05 : -0.4);
    g.fill();
  }
  ellipse(g, 12, -12, 14, 6, -0.6);
  g.fill();
  g.strokeStyle = shade(0xd9a07a, -0.1);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-10, 6);
  g.quadraticCurveTo(6, 10, 20, 4);
  g.stroke();
  g.restore();
}

/**
 * Compteur « juste ce qu'il faut » pour les jeux qui comptent (friandises, lancers…) :
 * n cases dans un cadre vert avec un ✓ (la bonne quantité), puis des cases grisées
 * (trop). Les cases données sont pleines, les autres en transparence.
 * x, y : la première case ; icon : l'emoji ; step : l'écart entre deux cases.
 */
export function drawCountZone(g, x, y, given, n, max, icon, step = 34) {
  g.save();
  // Fond clair sous tout le compteur : il reste lisible sur le bois foncé comme sur le ciel.
  g.fillStyle = 'rgba(255, 255, 255, 0.82)';
  rrect(g, x - 22, y - 22, step * (max - 1) + 44, 44, 14);
  g.fill();
  // Cadre vert sur les n premières cases
  g.fillStyle = 'rgba(63, 174, 98, 0.3)';
  g.strokeStyle = '#1e8a4a';
  g.lineWidth = 2.5;
  rrect(g, x - 18, y - 19, step * (n - 1) + 36, 38, 12);
  g.fill();
  g.stroke();
  label(g, '✓', x + step * (n - 1) + 18, y - 19, 18, '#1e5c3e');
  for (let i = 0; i < max; i++) {
    const over = i >= n;
    const done = i < given;
    emoji(g, icon, x + i * step, y, over ? 22 : 26, 0, done ? 1 : over ? 0.3 : 0.45);
    if (over && done) label(g, '!', x + i * step + 12, y - 12, 16, '#c8463c');
  }
  g.restore();
}

/** Nombre de friandises « juste ce qu'il faut » pour cet animal (1 à 3). */
const TREAT_COUNT = { rabbit: 1, cat: 2, dog: 2, sheep: 2, goat: 2, horse: 3, cow: 3 };
export function treatCount(a) {
  const base = TREAT_COUNT[a.species] ?? 2;
  // Un animal déjà bien rond en a une de moins (jamais moins d'une).
  return Math.max(1, (a.weight ?? 50) > 75 ? base - 1 : base);
}

export function treatGame(ctx) {
  const { a, t, fx } = ctx;
  const hint = (text, kind) => ctx.hint(nb(text), kind);
  const big = isBig(a);
  const floorY = 300;
  const s = sizeFor(a, big ? 1.12 : 1.1);
  const ax = big ? 150 : 165;
  const treat = TREATS[a.species] ?? '🍪';
  // Ton cheval : deux boutons, 🥕 et 🍎 ; sa préférée lui fait plaisir (le jeu la note : opts.out.quirk)
  const qk = keepsMemories(a) ? quirksOf(a) : null;
  let kind = 'carrot'; // (la dernière choisie : Espace et le doigt sur la scène donnent la même)
  let favFound = false;
  const calmTime = a.personality === 'shy' || a.personality === 'calm' ? 1.6 : a.personality === 'playful' ? 1.05 : 1.25;
  // « Juste ce qu'il faut » : n friandises (selon l'animal), visibles en haut dans le cadre vert,
  // puis « ✅ C'est bon ! ». Une de plus ou de moins : un peu moins de points ; deux : le
  // plancher. À max, l'animal a tout mangé et c'est fini (trop). Juste = tous les points :
  // donner trop tôt (l'animal n'est pas sage) ne retire rien, mais il s'agite de plus belle et
  // la friandise attend.
  const n = treatCount(a);
  const max = n + 2;
  let state = 'wiggle';
  let timer = 0;
  let next = 1.2 + ctx.rng();
  let given = 0;
  let penalties = 0;
  let fly = null;
  let handBack = 0;
  const pose = a.species === 'rabbit' ? 'beg' : a.species === 'dog' || a.species === 'cat' ? 'sit' : 'stand';

  const asking = () => qk && !favFound && !knows(a, 'treat'); // (carotte ou pomme : on ne sait pas encore)
  hint(asking() ? t('mg_treat_which', { name: a.name }) : `${t(big ? 'mg_treat_hint_flat' : 'mg_treat_hint')} ${treat.repeat(n)}`);
  ctx.zone((n - 0.5) / max, (n + 0.5) / max);
  if (qk) for (const k of Object.keys(HORSE_TREATS)) ctx.button(`${HORSE_TREATS[k]} ${t('mg_treat_btn')}`, { cls: 'primary', onTap: () => give(k) });
  else ctx.button(`${treat} ${t('mg_treat_btn')}`, { cls: 'primary', onTap: () => give() });
  // « C'est bon ! » pour s'arrêter là : disponible dès la première friandise (on revérifie au
  // tap : un bouton grisé ne doit jamais finir le jeu, même si le navigateur transmet le geste).
  const stopBtn = ctx.stopButton(() => { if (given > 0) end(); }, stopLabel(t));
  stopBtn.disabled = true;

  const shape = () => animalShape(a, { x: ax, y: floorY, s, f: 1, pose: state === 'calm' || state === 'eat' ? pose : 'stand' });
  const handPos = () => {
    const sh = shape();
    return { x: Math.max(sh.mouth.x + 70, 300) + handBack * 30, y: Math.min(sh.mouth.y + 10, 250) };
  };
  const waitHint = () => (asking() ? t('mg_treat_which', { name: a.name }) : t(big ? 'mg_treat_hint_flat' : 'mg_treat_hint'));

  function give(k = kind) {
    if (ctx.done || state === 'eat') return;
    if (qk) kind = k;
    if (state === 'calm') {
      const hp = handPos();
      fly = { x0: hp.x - 20, y0: hp.y - 14, k: 0, ch: qk ? HORSE_TREATS[kind] : treat };
      state = 'eat';
      timer = 0;
      given++;
      stopBtn.disabled = false;
      if (given === n) fx.text(hp.x - 40, hp.y - 60, t('mg_perfect'), '#2f8a5f', 24);
      else if (given < n) fx.text(hp.x - 40, hp.y - 60, t('mg_good'), '#2f8a5f', 24);
      else fx.text(hp.x - 40, hp.y - 60, t('mg_oops'), '#c8463c', 24);
      if (qk && kind === qk.treat) {
        // 🔍 Sa préférée : un cœur de plus
        favFound = true;
        if (given <= n) {
          const sh = shape();
          fx.text(hp.x - 40, hp.y - 92, t('mg_treat_fav'), '#d6457a', 22);
          fx.burst(sh.head.x, sh.head.y - 20, '💖', 5);
        }
        if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), quirk: 'treat' };
      }
      ctx.progress(given / max);
    } else {
      // Trop tôt : la main recule, et l'animal, tout excité, met un peu plus longtemps à se calmer.
      penalties++;
      handBack = 1;
      next = Math.max(next, timer + 0.8);
      const sh = shape();
      fx.text(sh.head.x, sh.head.y - 50, t('mg_wait'), '#c07a10', 22);
      hint(t('mg_treat_wait', { name: a.name }), 'warn');
    }
  }

  /** Fin : la note suit le nombre donné (juste / un peu trop peu / un peu trop). */
  function end() {
    if (ctx.done) return;
    ctx.finishJust(given, n, n, { who: a.name, slack: 2, msgs: justMsgs(t, a.name) });
  }

  return {
    peek: () => ({ state, given, rounds: given, n, max, lo: n, hi: n, value: given, penalties, fav: qk?.treat ?? null, kind }),
    down() { give(); },
    key(code, down) {
      // Espace : donner ; Entrée : « C'est bon ! » (dès la première friandise).
      if (!down) return;
      if (code === 'Space') give();
      else if ((code === 'Enter' || code === 'NumpadEnter') && given > 0) end();
    },
    update(dt) {
      timer += dt;
      handBack = Math.max(0, handBack - dt * 2);
      if (ctx.done) return;
      if (state === 'wiggle' && timer > next) {
        state = 'calm';
        timer = 0;
        if (given < n) hint(t(big ? 'mg_treat_now_flat' : 'mg_treat_now'), 'good');
      } else if (state === 'calm' && timer > calmTime) {
        state = 'wiggle';
        timer = 0;
        next = 1 + ctx.rng() * 1.6;
        if (given < n) hint(waitHint());
      } else if (state === 'eat') {
        if (fly) fly.k = Math.min(1, fly.k + dt * 3.2);
        if (Math.random() < dt * 6) {
          const sh = shape();
          fx.float(sh.head.x, sh.head.y - 30, given > n ? '💤' : '💛', 20);
        }
        if (timer > 1.1) {
          fly = null;
          if (given >= max) {
            // Il a tout mangé : c'est trop, et c'est fini.
            end();
            return;
          }
          state = 'wiggle';
          timer = 0;
          next = 1 + ctx.rng() * 1.8;
          if (given === n) hint(`✅ ${t('mg_stopHere')}`, 'good');
          else if (given > n) hint(t('mg_tooMuch', { name: a.name }), 'warn');
          else hint(waitHint());
        }
      }
    },
    draw(g) {
      homeBackground(g, ctx, floorY);
      const tm = ctx.time;
      const calm = state === 'calm' || state === 'eat' || ctx.done;
      const wig = state === 'wiggle' && !ctx.done;
      const lift = wig && !big ? Math.abs(Math.sin(tm * 8)) * 16 * s : 0;
      const sh = drawAnimalLifted(g, a, {
        x: ax + (wig ? Math.sin(tm * 4) * 10 : 0),
        y: floorY,
        s,
        f: 1,
        pose: calm ? pose : 'stand',
        walk: wig ? tm * 12 : null,
        wag: given <= n,
        headDip: wig && big ? 0.25 + Math.sin(tm * 7) * 0.2 : 0,
        mouth: state === 'eat' && fly?.k >= 1,
        happy: (state === 'eat' && given <= n) || (ctx.done && given <= n),
        time: tm,
      }, lift);
      if (state === 'calm' && !ctx.done) {
        // Halo « il est sage »
        g.save();
        g.globalAlpha = 0.5 + Math.sin(tm * 10) * 0.25;
        g.strokeStyle = '#f2c84b';
        g.lineWidth = 5;
        circle(g, sh.head.x, sh.head.y, sh.hr * 1.9);
        g.stroke();
        g.restore();
        emoji(g, '✨', sh.head.x - sh.hr * 1.6, sh.head.y - sh.hr * 1.4, 22);
        emoji(g, '✨', sh.head.x + sh.hr * 1.6, sh.head.y - sh.hr * 0.6, 18);
        // Petit chrono qui se vide
        const k = 1 - timer / calmTime;
        g.strokeStyle = '#2f8a5f';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(sh.head.x, sh.head.y - sh.hr * 2.6, 12, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        g.stroke();
      }
      // Rassasié (juste) ou gavé (trop) : une petite bulle au-dessus de la tête
      if (given >= n && state !== 'eat' && !ctx.done) emoji(g, given > n ? '🥱' : '😋', sh.head.x + sh.hr * 1.4, sh.head.y - sh.hr * 1.8, 26);
      // Main + friandise
      const hp = handPos();
      drawHand(g, hp.x, hp.y, 1.1, true);
      if (!fly && state !== 'eat') {
        if (qk) { emoji(g, HORSE_TREATS.carrot, hp.x - 26, hp.y - 16, 26, -0.5); emoji(g, HORSE_TREATS.apple, hp.x + 2, hp.y - 16, 26); }
        else emoji(g, treat, hp.x - 14, hp.y - 16, 30);
      }
      if (fly) {
        const k = fly.k;
        const x = lerp(fly.x0, sh.mouth.x, k);
        const y = lerp(fly.y0, sh.mouth.y, k) - Math.sin(k * Math.PI) * 40;
        if (k < 1) emoji(g, fly.ch, x, y, 30 * (1 - k * 0.4));
      }
      // Compteur : n friandises dans le cadre vert, les suivantes grisées (trop)
      drawCountZone(g, 36, 32, given, n, max, qk ? HORSE_TREATS[kind] : treat);
    },
  };
}

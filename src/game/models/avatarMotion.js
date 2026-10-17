// Logique « pure » de l'animation des personnages (aucune dépendance à three.js ni au DOM) :
// planification du clignement des yeux, choix des gestes d'attente, gestes de soin,
// enveloppes de poids, images clés, plis des jambes (accroupi, à cheval) et allures à cheval.
// Le moteur qui applique ces valeurs au squelette est dans avatarRig.js ; les tests sont dans
// tests/avatarMotion.test.js.

// ------------------------------------------------------------------ hasard

/** Petit générateur pseudo-aléatoire reproductible (mulberry32) : chaque personnage a le sien. */
export function makeRandom(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ clignement

/** Réglages du clignement (secondes). */
export const BLINK = {
  min: 2, // délai minimal entre deux clignements
  max: 6, // délai maximal
  double: 0.22, // probabilité d'un double clignement
  close: 0.07, // la paupière descend
  hold: 0.03, // fermée
  open: 0.1, // elle remonte
  gap: 0.09, // entre les deux clignements d'un double
};

/** Durée d'un clignement simple. */
export const blinkLength = () => BLINK.close + BLINK.hold + BLINK.open;

/** Prochain clignement : { delay (2 à 6 s), double }. rand() renvoie un nombre dans [0, 1[. */
export function planBlink(rand) {
  return { delay: BLINK.min + rand() * (BLINK.max - BLINK.min), double: rand() < BLINK.double };
}

/** Durée totale d'un clignement (simple ou double). */
export const blinkDuration = (double) => (double ? blinkLength() * 2 + BLINK.gap : blinkLength());

/** Fermeture de la paupière (0 = ouverte, 1 = fermée) t secondes après le début du clignement. */
export function blinkAmount(t, double = false) {
  const one = blinkLength();
  if (double && t > one) t -= one + BLINK.gap;
  if (t <= 0 || t >= one) return 0;
  if (t < BLINK.close) return smooth(t / BLINK.close);
  if (t < BLINK.close + BLINK.hold) return 1;
  return 1 - smooth((t - BLINK.close - BLINK.hold) / BLINK.open);
}

/** Petit mouvement du regard : prochaine cible { yaw, pitch, delay }. */
export function planGaze(rand) {
  // Le plus souvent devant soi, parfois un coup d'œil sur le côté.
  const wide = rand() < 0.25;
  return {
    yaw: (rand() * 2 - 1) * (wide ? 0.32 : 0.12),
    pitch: (rand() * 2 - 1) * 0.07 - 0.02,
    delay: 0.6 + rand() * 2.2,
  };
}

// ------------------------------------------------------------------ attente

/** Gestes d'attente (de temps en temps quand on ne bouge pas) et leur durée (s). */
export const IDLE_GESTURES = {
  scratch: 2.3, // se gratter la tête
  look: 3.4, // regarder autour de soi
  hips: 3.6, // mains sur les hanches
  stretch: 2.6, // s'étirer
};
const IDLE_WEIGHTS = { scratch: 1, look: 1.6, hips: 1.1, stretch: 0.6 };

/** Choisit un geste d'attente, jamais deux fois le même de suite. */
export function pickIdleGesture(rand, last = null) {
  const list = Object.keys(IDLE_GESTURES).filter((k) => k !== last);
  const total = list.reduce((n, k) => n + IDLE_WEIGHTS[k], 0);
  let r = rand() * total;
  for (const k of list) {
    r -= IDLE_WEIGHTS[k];
    if (r < 0) return k;
  }
  return list[list.length - 1];
}

/** Délai avant le prochain geste d'attente (s) ; calm > 1 espace les gestes. */
export const nextIdleDelay = (rand, calm = 1) => (4.5 + rand() * 7.5) * calm;

/** Délai avant de changer de jambe d'appui (s). */
export const nextShiftDelay = (rand) => 3.5 + rand() * 5.5;

// ------------------------------------------------------------------ soins

/** Durée d'un geste de soin du joueur (s). */
export const CARE_GESTURE_TIME = 1.35;

const CARE_GESTURES = {
  feed: 'pour', // verser dans la gamelle
  water: 'pour',
  treat: 'offer', // tendre la main
  brush: 'brush', // coups de brosse
  pet: 'pet', // caresser
  wash: 'scrub', // frotter
  clean: 'scrub',
  nails: 'tool', // accroupi, petits gestes précis
  shoe: 'tool',
  play: 'play', // lancer la balle
  lunge: 'lead', // bras levé, la longe
  liberty: 'lead',
  shear: 'brush',
  milk: 'milk',
  cure: 'offer', // le vétérinaire donne le remède
  refill: 'pour',
  scoop: 'scrub',
};

/** Geste qui correspond à un soin (ou à une tâche d'aide). */
export const careGestureFor = (action) => CARE_GESTURES[action] ?? 'pet';

/**
 * Hauteur (m, depuis le sol) où va la main pour un geste, selon la hauteur du dos de l'animal :
 * la gamelle est par terre, la friandise devant la bouche, la brosse sur le dos ou l'encolure,
 * les sabots en bas. Plus c'est bas, plus on se penche (et on s'accroupit pour les petits).
 */
export function gestureHeight(kind, back) {
  if (kind === 'pour' || kind === 'milk') return clamp(back * 0.55, 0.3, 0.9);
  if (kind === 'offer') return clamp(back * 0.75, 0.3, 1.15);
  if (kind === 'tool') return clamp(back * 0.35, 0.3, 0.6);
  if (kind === 'lead' || kind === 'play') return 1;
  return clamp(back * 0.82, 0.3, 1.25);
}

// ------------------------------------------------------------------ outils d'animation

/** Poids d'un geste de durée dur : monte en fadeIn, redescend en fadeOut (0 à 1). */
export function envelope(t, dur, fadeIn = 0.25, fadeOut = 0.3) {
  if (t <= 0 || t >= dur) return 0;
  const a = fadeIn > 0 ? clamp(t / fadeIn, 0, 1) : 1;
  const b = fadeOut > 0 ? clamp((dur - t) / fadeOut, 0, 1) : 1;
  return smooth(Math.min(a, b));
}

/** Interpolation douce d'images clés [[t, v], …] (triées par t). */
export function keyframes(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1));
    }
  }
  return keys[keys.length - 1][1];
}

// ------------------------------------------------------------------ jambes

/** Longueurs du squelette des jambes (m) : hanche → genou, genou → cheville, cheville → sol. */
export const LEG = { thigh: 0.4, shin: 0.36, foot: 0.06 };

/**
 * Jambe à deux os dans le plan de profil : où placer la cheville (dz vers l'avant, dy vers le haut,
 * depuis la hanche) → { hip, knee } (radians, dans les conventions de l'avatar : hip < 0 = cuisse
 * vers l'avant, knee > 0 = genou plié). Une cible trop loin donne une jambe tendue dans sa direction.
 */
export function legIK(dz, dy, thigh = LEG.thigh, shin = LEG.shin, out = {}) {
  const d = clamp(Math.hypot(dz, dy), Math.abs(thigh - shin) + 1e-4, thigh + shin - 1e-4);
  // Angle intérieur au genou (loi des cosinus), puis angle de la cuisse.
  const cosK = clamp((thigh * thigh + shin * shin - d * d) / (2 * thigh * shin), -1, 1);
  const knee = Math.PI - Math.acos(cosK);
  // Direction hanche → cheville (0 = vers le bas, > 0 = vers l'avant).
  const dir = Math.atan2(dz, -dy);
  const cosA = clamp((thigh * thigh + d * d - shin * shin) / (2 * thigh * d), -1, 1);
  out.hip = -(dir + Math.acos(cosA));
  out.knee = knee;
  return out;
}

/**
 * Accroupi (depth 0 = debout, 1 = très accroupi) : la cheville reste sous la hanche, le pied à plat.
 * Renvoie { hip, knee, ankle, drop } — drop = de combien le bassin descend (m).
 * out : objet réutilisé (pas d'allocation à chaque image).
 */
export function squatPose(depth, out = {}) {
  const k = clamp(depth, 0, 1);
  const stand = LEG.thigh + LEG.shin;
  const h = stand - k * 0.36; // jusqu'à 36 cm plus bas
  legIK(0.015 * k, -h, LEG.thigh, LEG.shin, out);
  // La cheville compense : le pied reste à plat (somme des angles nulle).
  out.ankle = -(out.hip + out.knee);
  out.drop = stand - h;
  return out;
}

// ------------------------------------------------------------------ à cheval

/** Poids des allures à partir de gait (0 = pas, 1 = trot, 2 = galop). */
export function gaitWeights(gait, out = {}) {
  const g = clamp(gait, 0, 2);
  out.walk = Math.max(0, 1 - g);
  out.trot = Math.max(0, 1 - Math.abs(g - 1));
  out.gallop = Math.max(0, g - 1);
  return out;
}

/**
 * Allure d'après la vitesse (même seuils que l'animation du cheval) : pour un modèle qui ne la donne pas.
 * v = vitesse sans l'échelle de l'animal ; walk / run = vitesses de l'espèce.
 */
export function gaitFromSpeed(v, walk, run) {
  if (v < 0.05) return 0;
  if (v > run * 0.65) return 2;
  return v > walk * 1.45 ? 1 : 0;
}

/**
 * Posture du cavalier pour une allure : lift = hauteur du bassin au-dessus de la selle (m),
 * lean = buste penché vers l'avant (rad), pitch = petit balancement du buste, sway = roulis,
 * reach = mains plus en avant (m), low = mains plus basses (m).
 * posting : trot enlevé (sinon trot assis, par exemple sans selle). out : objet réutilisé.
 */
const _gw = {};
export function riderPose(gait, phase, posting = true, out = {}) {
  const w = gaitWeights(gait, _gw);
  // Trot enlevé : on se lève sur un battement sur deux (une fois par foulée), en douceur.
  const rise = 0.5 - 0.5 * Math.cos(phase);
  const post = posting ? w.trot : 0;
  const sit = posting ? 0 : w.trot;
  const lift = post * 0.075 * rise + sit * 0.012 * Math.abs(Math.sin(phase)) + w.gallop * (0.035 + 0.02 * Math.sin(phase));
  const lean = w.walk * 0.03 + post * (0.16 + 0.05 * rise) + sit * 0.02 + w.gallop * 0.42;
  const pitch = w.walk * 0.035 * Math.sin(phase * 2) + sit * 0.05 * Math.sin(phase * 2) + w.gallop * 0.06 * Math.sin(phase);
  const sway = w.walk * 0.03 * Math.sin(phase) + sit * 0.015 * Math.sin(phase);
  const reach = w.walk * 0.02 * Math.sin(phase * 2) + w.gallop * (0.09 + 0.04 * Math.sin(phase));
  const low = w.gallop * 0.07;
  out.lift = lift;
  out.lean = lean;
  out.pitch = pitch;
  out.sway = sway;
  out.reach = reach;
  out.low = low;
  return out;
}

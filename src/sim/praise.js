// 🤚 « Bravo ! » / « Rassure-le » en selle : juste après un beau saut de tronc (⭐), après le retour au calme au pas, ou
// juste après un écart, un bouton rond rose apparaît quelques secondes (à la place de ⬆️). Touché : la main du cavalier
// gratte le garrot (les chevaux se grattent là entre eux, au pré) et des 💕 montent. Après un écart, il se calme ; si
// c'était sa peur à lui, elle recule (src/sim/horseQuirks.js calmFear). Ne pas toucher ne coûte rien.
// Logique pure (tests/praise.test.js) ; le jeu : src/game/Player.js (openPraise, praised), src/game/Game.js
// (canPraise, praiseHorse), src/game/FreeJumps.js (le beau saut), le bouton : src/ui/UI.js (updatePostBtn).
//
// Dans le joueur (pas sauvegardé) : pl.praise = { why, until, n } ; dans l'animal (sauvegardé) : a.praiseDay = { day, n }.

import { WARMUP } from './warmup.js';
import { quirksOf, knows } from './horseQuirks.js';
import { keepsMemories } from './memories.js';

export const PRAISE = {
  window: 3, // (secondes pour toucher, après un beau saut)
  spookWindow: 4, // (après un écart)
  coolWindow: 6, // (après le retour au calme : on a le temps)
  bond: 0.3,
  affection: 3,
  perRide: 3, // (au plus, par balade)
  perDay: 6, // (au plus, par jour, qui font grandir le lien)
  calm: 1.3, // (rassuré après un écart : le prochain vient plus tard)
};
const WINDOWS = { jump: PRAISE.window, spook: PRAISE.spookWindow, cool: PRAISE.coolWindow };

export const newPraise = () => ({ why: null, until: -1, n: 0 });

/** Le bouton apparaît : why 'jump' | 'spook' | 'cool' ; now en secondes (l'horloge du cheval). Plus rien après perRide. */
export function openPraise(st, why, now) {
  if (!st || st.n >= PRAISE.perRide || !WINDOWS[why]) return;
  st.why = why;
  st.until = now + WINDOWS[why];
}

/** Le bouton est là ? */
export const canPraise = (st, now) => !!st?.why && now < st.until;

/**
 * Touché : le bouton s'en va. Ton cheval (pas un cheval confié), au plus perDay fois par jour : lien +0,3 et affection
 * +3. Renvoie { ok, why, fav } (fav : le garrot est son coin préféré, et tu le sais).
 */
export function doPraise(st, a, now, day) {
  if (!canPraise(st, now)) return { ok: false, why: null, fav: false };
  const why = st.why;
  st.why = null;
  st.until = -1;
  st.n++;
  if (keepsMemories(a)) {
    if (a.praiseDay?.day !== day) a.praiseDay = { day, n: 0 };
    if (a.praiseDay.n < PRAISE.perDay) {
      a.praiseDay.n++;
      a.bond = Math.min(100, (a.bond ?? 0) + PRAISE.bond);
      a.needs.affection = Math.min(100, (a.needs.affection ?? 50) + PRAISE.affection);
    }
  }
  return { ok: true, why, fav: quirksOf(a).spot === 'withers' && knows(a, 'spot') };
}

/** Le retour au calme vient d'être fini (assez de galop, puis 15 s de pas) : coolBefore, s.cool avant cette image. */
export const coolJustDone = (s, coolBefore) => s.hard >= WARMUP.hard && coolBefore < WARMUP.cool && s.cool >= WARMUP.cool;

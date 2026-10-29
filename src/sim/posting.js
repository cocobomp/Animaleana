// ⬆️ Le trot enlevé : au trot, en selle (avec des étriers), le cavalier se lève et se rassoit en rythme, une fois par
// foulée. On touche « ⬆️ Enlever » (ou Espace) au temps fort, quand le cercle se referme et que le sabot tape ; trois
// bons temps de suite et tu trottes enlevé : c'est plus doux pour le dos du cheval, il se fatigue deux fois moins au
// trot. Sans toucher, on trotte assis (on rebondit dans la selle). Logique pure (tests/posting.test.js) ; le jeu :
// src/game/Player.js (rideStep), src/game/Game.js (postTrot), le bouton : src/ui/UI.js (updatePostBtn).
//
// stride : le numéro de foulée du cheval, avec sa fraction (la phase de l'allure / 2π) ; le temps fort est sur
// chaque foulée entière (le cavalier est assis, il va se lever).

export const POST = {
  window: 0.2, // (de chaque côté du temps fort, en part de foulée)
  streakOn: 3, // (trois bons temps de suite : tu trottes enlevé)
  hold: 1.6, // (foulées sans toucher : on retombe assis)
  save: 0.5, // (le trot coûte deux fois moins d'énergie au cheval)
  statAt: 8, // (huit bons temps de suite : bravo, une fois par balade)
};

export function newPosting() {
  return { streak: 0, best: 0, good: 0, miss: 0, lastBeat: null, lastStride: -99, counted: false };
}

/**
 * Tu touches au moment `stride`. Renvoie { ok, streak, off (écart au temps fort, en part de foulée), early } :
 * ok si c'est assez près d'un temps fort pas encore pris ; sinon la série repart de zéro.
 */
export function tapPost(st, stride) {
  const beat = Math.round(stride);
  const off = stride - beat; // (négatif : trop tôt ; positif : trop tard)
  if (Math.abs(off) <= POST.window && beat !== st.lastBeat) {
    st.streak++;
    st.good++;
    st.best = Math.max(st.best, st.streak);
    st.lastBeat = beat;
    st.lastStride = stride;
    return { ok: true, streak: st.streak, off, early: off < 0 };
  }
  st.streak = 0;
  st.miss++;
  return { ok: false, streak: 0, off, early: off < 0 };
}

/** Trotte-t-on enlevé à ce moment ? (la série, et le dernier bon temps n'est pas trop loin) */
export const isPosting = (st, stride) => !!st && st.streak >= POST.streakOn && stride - st.lastStride <= POST.hold;

/** Chaque image : trop longtemps sans toucher (ou plus au trot), la série retombe à zéro. */
export function postTick(st, stride, trotting) {
  if (!st) return;
  if (!trotting || stride - st.lastStride > POST.hold) st.streak = 0;
}

/** La série vient d'atteindre POST.statAt : à fêter et compter (une fois par balade). */
export function postMilestone(st) {
  if (st.counted || st.streak < POST.statAt) return false;
  st.counted = true;
  return true;
}

/** Le cercle du bouton : 1 juste après un temps fort, 0 au temps fort suivant (il se referme sur le bouton). */
export const beatRing = (stride) => 1 - (stride - Math.floor(stride));

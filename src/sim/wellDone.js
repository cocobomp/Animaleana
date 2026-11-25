// ⭐ Le travail bien fait rapporte (« Bravo ! ») : à la fin d'un soin ou d'une corvée en mini-jeu, les étoiles de la
// carte de fin donnent une petite prime : ★★★ +5 🪙, ★★ +2 🪙, ★ rien de plus (et jamais rien en moins).
// - Au plus 20 🪙 par jour de jeu ; au bord du plafond, on paie le reste (18 déjà gagnés, ★★★ : +2).
// - Une seule prime par (animal, soin) et par (corvée, box) chaque jour de jeu : refaire le même soin ne paie plus.
// - Seulement pour TES animaux : pas un animal confié (pension, soins), ni celui d'un client, ni un chien en éducation.
// - Pas de prime pour les métiers (toiletteur, éducateur, vétérinaire, guide), la tonte et la traite, seller, brider, le
//   vermifuge, ni les soins automatiques ou groupés : ils ne donnent pas de wellDone au mini-jeu (seuls UI.careWithGame
//   et Interiors.chore le font). La préparation au concours de TON animal (bain, brossage : src/ui/beauty.js doPrep)
//   passe par careWithGame : ce sont de vrais soins, ils comptent.
// Les étoiles viennent du cadre des mini-jeux (starsFor(quality, endVerdict) dans showEnd : celles que l'enfant voit),
// jamais recalculées. La prime est payée APRÈS le soin réussi (Game.wellDone). Bac à sable : jamais de pièces, mais le
// mot de fête, comme en gestion.
// Logique pure (tests/bien-fait.test.js) ; le jeu : Game.wellDone ; l'écran : la pastille « +5 🪙 » dans la ligne des
// étoiles de la carte de fin (src/ui/minigames.js showEnd) et la ligne « ⭐ Primes Bravo aujourd'hui » des petits
// boulots (src/ui/panels.js).
//
// Dans le profil (sauvegardé ; créé au premier usage, absent d'une ancienne partie, lu de façon tolérante) :
//   wellDone : { day, coins (primes gagnées ce jour-là), keys (ce qui a déjà eu sa prime ce jour-là) }
// Statistiques (Game.wellDone) : wellDone (★★ ou ★★★), wellDone3 (★★★).

/** pay : les pièces selon le nombre d'étoiles (indice 0 à 3) ; perDay : le plafond d'un jour de jeu. */
export const WELL_DONE = { pay: [0, 0, 2, 5], perDay: 20 };

/** La clé d'un soin : une prime par animal et par soin chaque jour. */
export const careKey = (a, action) => `care:${a?.id ?? '?'}:${action}`;
/** La clé d'une corvée : une prime par corvée et par box (ou pièce) chaque jour, à cet endroit. */
export const choreKey = (kind, target, place) => `chore:${kind}:${target ?? ''}:${place ?? ''}`;

/** Les pièces de ces étoiles (★★★ 5, ★★ 2, sinon 0 ; une valeur bizarre : 0). */
export const wellDonePay = (stars) => (Number.isInteger(stars) ? WELL_DONE.pay[stars] ?? 0 : 0);

/** Le compte du jour day : { coins, keys } (absent, abîmé ou d'un autre jour : un jour tout neuf). */
export function wellDoneToday(profile, day) {
  const w = profile?.wellDone;
  if (!w || typeof w !== 'object' || w.day !== day) return { coins: 0, keys: [] };
  return {
    coins: Number.isFinite(w.coins) ? Math.max(0, w.coins) : 0,
    keys: Array.isArray(w.keys) ? w.keys.filter((k) => typeof k === 'string') : [],
  };
}

/**
 * Ce que rapporteraient ces étoiles maintenant, sans rien changer. w : { stars (celles de la carte), key (careKey ou
 * choreKey), own (un de tes animaux, ou une corvée), day }. Renvoie { coins (les pièces : 0 en bac à sable), n (la
 * prime comptée, même en bac à sable : elle dit s'il y a un mot de fête), capped (plafond du jour déjà atteint), again
 * (déjà eu sa prime aujourd'hui) }.
 */
export function wellDonePreview(profile, { stars, key = '', own = true, day } = {}) {
  const pay = wellDonePay(stars);
  const today = wellDoneToday(profile, day);
  const again = today.keys.includes(String(key));
  const capped = today.coins >= WELL_DONE.perDay;
  const n = !own || !pay || again ? 0 : Math.min(pay, Math.max(0, WELL_DONE.perDay - today.coins));
  return { coins: profile?.mode === 'sandbox' ? 0 : n, n, capped, again };
}

/**
 * Note la prime (même résultat que wellDonePreview) : profile.wellDone est créé, ou remis à neuf un nouveau jour. Rien
 * n'est noté sans prime (★, plafond, déjà fait) : un ★ peut être retenté pour ★★★.
 */
export function recordWellDone(profile, w = {}) {
  const r = wellDonePreview(profile, w);
  if (r.n > 0) {
    const today = wellDoneToday(profile, w.day);
    profile.wellDone = { day: w.day, coins: today.coins + r.n, keys: [...today.keys, String(w.key ?? '')] };
  }
  return r;
}

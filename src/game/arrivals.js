// Les visiteurs des métiers arrivent chacun leur tour : client de la pension ou du vétérinaire, maître de
// l'éducateur canin, client du toiletteur, randonneurs du guide, propriétaire qui revient chercher son animal.
// Sans cela, le matin ou après ⏩, trois ou quatre arrivaient à la même seconde et leurs messages
// s'empilaient au milieu de l'écran (390×844).
//
// Chaque métier demande game.arrivals.free() avant une arrivée automatique, et note() quand quelqu'un
// arrive (même forcé : « 👉 Montre-moi », console), pour que le suivant attende.

/** Minutes de jeu entre deux arrivées. */
export const ARRIVAL_GAP_MINUTES = 10;
/** Et secondes réelles (en ×4 ou après une nuit, le temps du jeu file) : le message précédent a eu le temps de partir. */
export const ARRIVAL_GAP_MS = 8000;

const realNow = () => (globalThis.performance?.now?.() ?? Date.now());

export class Arrivals {
  /** clock : l'heure du jeu en minutes (profile.clock) ; now : l'heure réelle en millisecondes. */
  constructor({ clock, now = realNow } = {}) {
    this.clock = clock ?? (() => 0);
    this.now = now;
    this.lastClock = null;
    this.lastReal = null;
  }

  /** Un visiteur peut-il arriver maintenant ? */
  free() {
    if (this.lastClock === null) return true;
    const dc = this.clock() - this.lastClock;
    const dr = this.now() - this.lastReal;
    // (dc < 0 : autre profil, ou sauvegarde rechargée plus tôt dans la journée)
    return (dc < 0 || dc >= ARRIVAL_GAP_MINUTES) && dr >= ARRIVAL_GAP_MS;
  }

  /** Quelqu'un vient d'arriver : le suivant attendra. */
  note() {
    this.lastClock = this.clock();
    this.lastReal = this.now();
  }
}

// Les petits mots du guide (« Chapitre réussi ! Prochain chapitre… », « Tu as déjà 3 quêtes »…) en attente.
// Ils attendent qu'aucune fenêtre ne soit ouverte (menu des soins, fiche de l'animal, 💼 Métiers, fenêtre
// « niveau N », mini-jeu…) pour être vus : avant, la bulle se fermait tout de suite et le mot était perdu.
// Une fois vu, il reste `ms` à l'écran ; si une fenêtre s'ouvre par-dessus, il revient en tête de file.
// Sans DOM ni 3D : la bulle elle-même est dessinée par src/ui/tutorial.js (tests/quests.test.js).

export class NoticeQueue {
  constructor(ms = 25000) {
    this.ms = ms;
    this.waiting = [];
    this.current = null; // le mot affiché
    this.until = 0;
  }

  /** Un nouveau mot ; first : avant les autres (la réponse à un bouton qu'on vient de toucher). */
  add(n, { first = false } = {}) {
    if (first) this.waiting.unshift(n);
    else this.waiting.push(n);
  }

  /** Les mots en attente qui ne disent plus rien (stale(n) vrai : le chapitre qu'ils annonçaient est fini) s'en vont. */
  drop(stale) {
    if (this.waiting.some(stale)) this.waiting = this.waiting.filter((n) => !stale(n));
  }

  /** Le mot affiché retourne en tête de file (une autre bulle prend sa place un moment). */
  hold() {
    if (!this.current) return;
    this.waiting.unshift(this.current);
    this.current = null;
  }

  /**
   * Ce qu'il faut montrer maintenant, ou null. busy : une fenêtre, un message ou un mini-jeu prend l'écran.
   * now : l'heure (ms, performance.now()).
   */
  update(busy, now) {
    if (this.current && busy) this.hold(); // caché par une fenêtre : il attend sa fermeture
    if (this.current && now > this.until) this.current = null; // vu assez longtemps
    if (!this.current && !busy && this.waiting.length) {
      this.current = this.waiting.shift();
      this.until = now + this.ms;
    }
    return this.current;
  }

  /** On a touché OK, ✕, 🧭 ou 📖 : le mot affiché s'en va (le suivant viendra). */
  close() {
    this.current = null;
  }

  clear() {
    this.waiting = [];
    this.current = null;
  }

  get size() {
    return this.waiting.length + (this.current ? 1 : 0);
  }
}

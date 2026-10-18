// Tout petit système d'événements : le jeu annonce ce qui se passe
// (« adopted », « care », « skip », « panel »…) et d'autres modules peuvent écouter.
// Utilisation : game.on('adopted', (a) => …) ; game.emit('adopted', a).

export class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  /** Écoute un événement. Renvoie une fonction pour arrêter d'écouter. */
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.handlers.get(name)?.delete(fn);
  }

  emit(name, data) {
    for (const fn of [...(this.handlers.get(name) ?? [])]) {
      try {
        fn(data);
      } catch (err) {
        console.warn(`[événement ${name}]`, err);
      }
    }
    for (const fn of [...(this.handlers.get('*') ?? [])]) {
      try {
        fn(name, data);
      } catch (err) {
        console.warn('[événement *]', err);
      }
    }
  }
}

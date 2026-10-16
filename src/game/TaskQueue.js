// « Ma liste de tâches » : le joueur prépare une suite d'actions.
// En automatique, le personnage va sur place et fait l'action tout seul.
// En manuel, la liste s'arrête à cette tâche et c'est au joueur de la faire (mini-jeu).

import { uid } from '../sim/rng.js';

export class TaskQueue {
  constructor(game) {
    this.game = game;
    this.tasks = [];
    this.running = false;
    this.current = null; // { task, phase: 'walk' | 'doing' | 'manual' }
    this.autoMode = false;
    this.planTimer = 0;
  }

  /** Mode Auto : le personnage prévoit lui-même ses 5 prochaines actions et les fait. */
  setAuto(on) {
    this.autoMode = on;
    if (on) {
      this.replenish();
      this.running = true;
      this.game.ui.toast(this.game.ui.t('autoOn'), 4500);
    } else {
      // On garde les tâches choisies par le joueur, on retire celles prévues par le mode Auto.
      this.tasks = this.tasks.filter((x) => !x.planned || x === this.current?.task);
      if (!this.tasks.length) this.stop();
    }
    this.game.ui.refresh();
    this.game.ui.renderTasks();
  }

  /** Complète la liste jusqu'à 5 actions avec ce qui est le plus urgent. */
  replenish() {
    const keys = new Set(this.tasks.map((x) => x.key).filter(Boolean));
    for (const task of this.game.planAutoTasks(5 - this.tasks.length, keys)) {
      this.tasks.push({ id: uid(), mode: 'auto', planned: true, ...task });
    }
    this.game.ui.renderTasks();
  }

  /**
   * task : { label, icon, target: () => Vector3 | null, radius, auto: () => void, manual: () => Promise | void }
   */
  add(task) {
    this.tasks.push({ id: uid(), mode: 'auto', ...task });
    this.game.ui.renderTasks();
  }

  remove(id) {
    if (this.current?.task.id === id) this.skip();
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.game.ui.renderTasks();
  }

  move(id, delta) {
    const i = this.tasks.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.tasks.length) return;
    [this.tasks[i], this.tasks[j]] = [this.tasks[j], this.tasks[i]];
    this.game.ui.renderTasks();
  }

  toggleMode(id) {
    const t = this.tasks.find((x) => x.id === id);
    if (t) t.mode = t.mode === 'auto' ? 'manual' : 'auto';
    this.game.ui.renderTasks();
  }

  start() {
    if (!this.tasks.length) return;
    this.running = true;
    this.game.ui.renderTasks();
  }

  stop() {
    this.running = false;
    this.current = null;
    this.game.player.cancelGoTo();
    this.game.ui.renderTasks();
  }

  clear() {
    this.stop();
    this.tasks = [];
    this.game.ui.renderTasks();
  }

  /** Tâche manuelle finie (ou passée) : on continue la liste. */
  next() {
    if (this.current) this.tasks = this.tasks.filter((t) => t !== this.current.task);
    this.current = null;
    if (!this.tasks.length && !this.autoMode) {
      this.running = false;
      this.game.ui.toast(this.game.ui.t('tasksDone'));
    }
    this.game.ui.renderTasks();
  }

  skip() {
    this.game.player.cancelGoTo();
    this.next();
  }

  update() {
    const g = this.game;
    if (this.autoMode && !g.paused) {
      this.planTimer -= 1 / 60;
      if (this.planTimer <= 0 && this.tasks.length < 5) {
        this.planTimer = 2;
        this.replenish();
        if (this.tasks.length) this.running = true;
      }
    }
    // Le joueur a repris la main (joystick, clavier, toucher, pause) pendant la marche vers une tâche :
    // en manuel la liste s'arrête proprement, en mode Auto la tâche repart dès qu'il lâche.
    if (this.current?.phase === 'walk' && !g.player.auto) {
      this.current = null;
      if (!this.autoMode) this.running = false;
      g.ui.renderTasks();
    }
    if (!this.running || g.paused || this.current) return;
    const task = this.tasks[0];
    if (!task) return;
    const target = task.target?.();
    this.current = { task, phase: 'walk' };
    g.ui.renderTasks();
    const arrive = async () => {
      if (!this.current || this.current.task !== task) return;
      if (task.mode === 'auto') {
        this.current.phase = 'doing';
        task.auto();
        this.next();
      } else {
        this.current.phase = 'manual';
        g.ui.renderTasks();
        // Un soin (mini-jeu) rend une promesse : quand il est fini, on passe à la suite.
        // Un menu de bâtiment attend que le joueur appuie sur « Fait ».
        const res = task.manual();
        if (res && typeof res.then === 'function') {
          await res;
          if (this.current?.task === task) this.next();
        }
      }
    };
    if (target) g.walkTo(target, task.radius ?? 1.2, arrive, true);
    else arrive();
  }
}

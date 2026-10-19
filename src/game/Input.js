// Contrôles : clavier + souris sur ordinateur, joystick virtuel + glisser sur téléphone.

/** Touches qui « appuient » sur le bouton qui a le focus. */
export const isPress = (code) => code === 'Enter' || code === 'NumpadEnter' || code === 'Space';

/** L'élément qui reçoit la touche est un bouton, ou se trouve dans un panneau, une fenêtre ou un mini-jeu. */
export function onControl(el) {
  if (!el?.closest || el === document.body || el === document.documentElement) return false;
  return !!el.closest('button, a[href], [role="button"], summary, #panel, #modal, .mg-overlay, .vx-overlay');
}

export class Input {
  constructor(canvas, joystickEl) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // x : droite, y : avant
    this.look = { dx: 0, dy: 0 };
    this.btnLook = 0; // boutons ⟲ ⟳ à l'écran (-1, 0, 1)
    this.btnRun = false; // bouton « Courir » à l'écran
    this.zoom = 0;
    this.run = false;
    this.enabled = true;
    this.onKey = null;
    this.joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.lookPointers = new Map();
    this.pinchDist = 0;

    const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      // Entrée ou Espace sur un bouton (choisi avec Tab) ou dans un panneau, une fenêtre, un mini-jeu :
      // c'est le bouton qui la reçoit (clic natif). Avant, Entrée relançait « s'occuper de l'animal » à
      // portée, qui redessinait le panneau sous le bouton : « Caresser », « Monter »… ne faisaient rien.
      if (isPress(e.code) && onControl(e.target)) return;
      // Échap déjà utilisé (il vient de fermer une fenêtre) : le jeu ne le reçoit pas en plus.
      if (e.code === 'Escape' && e.defaultPrevented) return;
      this.keys.add(e.code);
      if (!e.repeat) this.onKey?.(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Vue : glisser sur l'écran (souris ou doigt), molette ou pincer pour zoomer.
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.lookPointers.get(e.pointerId);
      if (!p) return;
      if (this.lookPointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...this.lookPointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist) this.zoom += (this.pinchDist - d) * 0.03;
        this.pinchDist = d;
        return;
      }
      this.look.dx += e.clientX - p.x;
      this.look.dy += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const end = (e) => {
      const p = this.lookPointers.get(e.pointerId);
      // Un appui court sans glisser = « toucher » (aller quelque part, choisir un animal ou un bâtiment).
      if (p && e.type === 'pointerup' && this.lookPointers.size === 1
        && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 12 && performance.now() - p.t < 400) {
        this.onTap?.(e.clientX, e.clientY);
      }
      this.lookPointers.delete(e.pointerId);
      this.pinchDist = 0;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      this.zoom += Math.sign(e.deltaY) * 0.8;
      e.preventDefault();
    }, { passive: false });

    // Joystick virtuel
    const knob = joystickEl.querySelector('.knob');
    joystickEl.addEventListener('pointerdown', (e) => {
      joystickEl.setPointerCapture(e.pointerId);
      const r = joystickEl.getBoundingClientRect();
      this.joy = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: 0, y: 0, radius: r.width / 2 };
      this.updateJoy(e, knob);
    });
    joystickEl.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) this.updateJoy(e, knob);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy = { id: null, x: 0, y: 0 };
      knob.style.transform = 'translate(-50%, -50%)';
    };
    joystickEl.addEventListener('pointerup', joyEnd);
    joystickEl.addEventListener('pointercancel', joyEnd);
  }

  updateJoy(e, knob) {
    const j = this.joy;
    let dx = e.clientX - j.cx;
    let dy = e.clientY - j.cy;
    const len = Math.hypot(dx, dy);
    const max = j.radius * 0.8;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    j.x = dx / max;
    j.y = -dy / max;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Lit l'état du mouvement pour cette image. */
  poll() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('KeyZ') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyA') || k.has('KeyQ') || k.has('ArrowLeft')) x -= 1;
      x += this.joy.x;
      y += this.joy.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    // Sur le joystick, pousser jusqu'au bord fait courir.
    this.run = this.enabled && (k.has('ShiftLeft') || k.has('ShiftRight') || this.btnRun || Math.hypot(this.joy.x, this.joy.y) > 0.95);
    // Tourner la vue au clavier (pavé numérique) ou avec les boutons de l'écran.
    const keyLook = {
      x: (k.has('Numpad6') ? 1 : 0) - (k.has('Numpad4') ? 1 : 0) + this.btnLook,
      y: (k.has('Numpad2') ? 1 : 0) - (k.has('Numpad8') ? 1 : 0),
    };
    const look = { ...this.look };
    const zoom = this.zoom;
    this.look.dx = 0;
    this.look.dy = 0;
    this.zoom = 0;
    return { move: this.move, run: this.run, look, zoom, keyLook };
  }
}

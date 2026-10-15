// Interface des événements spéciaux : bandeau (titre, consigne, compte à rebours, progression,
// bouton « Y aller » avec une boussole), fenêtres de début et de fin, questions (adopter ? aider ?).

import { h } from './dom.js';
import { t } from '../i18n.js';

/** « 1 h 20 », « 45 min ». */
export function formatLeft(minutes) {
  const m = Math.max(0, Math.ceil(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (!hh) return t('ev_time_m', { m: mm });
  return t('ev_time_hm', { h: hh, m: String(mm).padStart(2, '0') });
}

// Flèche de la boussole (elle tourne vers la cible).
const ARROW_SVG = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2 L21 21 L12 16 L3 21 Z" fill="currentColor"/></svg>';

export class EventBanner {
  constructor(ui, onGo) {
    this.ui = ui;
    this.min = false;
    this.key = null;
    this.el = h('section', { id: 'ev-banner', hidden: true, 'aria-live': 'polite' });
    this.emoji = h('div', { class: 'ev-emoji', 'aria-hidden': 'true' });
    this.title = h('b', { class: 'ev-title' });
    this.left = h('span', { class: 'ev-left' });
    this.text = h('p', { class: 'ev-text' });
    this.fill = h('span', { class: 'ev-fill' });
    this.progText = h('span', { class: 'ev-prog-text' });
    this.prog = h('div', { class: 'ev-prog' }, h('span', { class: 'ev-track' }, this.fill), this.progText);
    this.arrow = h('span', { class: 'ev-arrow', 'aria-hidden': 'true', html: ARROW_SVG });
    this.dist = h('small', { class: 'ev-dist' });
    // Le bandeau n'est jamais reconstruit (seuls les textes changent) : le clic ne se perd pas.
    this.goBtn = h('button', { class: 'primary ev-go', onClick: () => onGo() },
      h('span', {}, t('ev_go')), h('span', { class: 'ev-compass' }, this.arrow, this.dist));
    this.minBtn = h('button', { class: 'ev-min', title: t('ev_min'), 'aria-label': t('ev_min'), onClick: () => this.collapse() }, '–');
    this.el.append(
      h('div', { class: 'ev-head' }, this.emoji, h('div', { class: 'ev-head-text' }, this.title, this.left), this.minBtn),
      this.text, this.prog, this.goBtn,
    );
    ui.root.append(this.el);
  }

  show(d) {
    if (this.min) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    this.el.dataset.type = d.type;
    this.el.classList.toggle('urgent', !!d.urgent);
    const set = (node, v) => { if (node.textContent !== v) node.textContent = v; };
    set(this.emoji, d.emoji);
    set(this.title, d.title);
    set(this.left, `⏳ ${d.left}`);
    set(this.text, d.text);
    this.prog.hidden = !d.prog;
    if (d.prog) {
      set(this.progText, d.prog.text);
      this.fill.style.width = `${Math.round(d.prog.ratio * 100)}%`;
    }
    this.goBtn.hidden = !d.canGo;
    const c = d.compass;
    this.arrow.parentElement.hidden = !c;
    if (c) {
      this.arrow.style.transform = `rotate(${Math.round(c.deg)}deg)`;
      set(this.dist, t('ev_dist', { n: c.dist }));
    }
    if (d.key !== this.key) {
      this.key = d.key;
      this.el.classList.remove('flash');
      void this.el.offsetWidth;
      this.el.classList.add('flash');
    }
  }

  hide() {
    this.el.hidden = true;
    this.key = null;
    this.min = false;
  }

  collapse() {
    this.min = true;
    this.el.hidden = true;
    this.ui.renderStatus();
  }

  expand() {
    this.min = false;
    this.ui.renderStatus();
  }
}

/** Petite fenêtre d'événement : gros emoji, titre, texte, boutons. */
function eventModal(ui, { emoji, title, text, lines = [], buttons, win }) {
  ui.showModal(h('div', { class: `ev-modal ${win === false ? 'lose' : ''}` },
    h('div', { class: 'ev-modal-emoji' }, emoji),
    h('h2', {}, title),
    h('p', { class: 'ev-modal-text' }, text),
    lines.length ? h('ul', { class: 'ev-lines' }, lines.map((l) => h('li', {}, l))) : null,
    h('div', { class: 'ev-buttons' }, buttons.map((b) => h('button', {
      class: b.primary ? 'primary' : '',
      onClick: () => { ui.hideModal(); b.run?.(); },
    }, b.label)))));
}

export function showEventIntro(ui, { emoji, title, text, hours }) {
  eventModal(ui, {
    emoji, title, text,
    lines: [t('ev_timeLimit', { t: formatLeft(hours * 60) })],
    buttons: [{ label: t('ev_start'), primary: true }],
  });
}

export function showEventResult(ui, { emoji, title, text, lines, win, onClose }) {
  eventModal(ui, { emoji, title, text, lines, win, buttons: [{ label: t(win ? 'ev_ok' : 'ev_okFail'), primary: true, run: onClose }] });
}

export function showStrayChoice(ui, { emoji, kind, text }, { adopt, refuge }) {
  eventModal(ui, {
    emoji, title: t('ev_lostPet_title', { kind }), text,
    buttons: [
      { label: t('ev_stray_adopt'), primary: true, run: adopt },
      { label: t('ev_stray_refuge'), run: refuge },
      { label: t('ev_later') },
    ],
  });
}

export function showNeighbourAsk(ui, { name, g, task }, onYes) {
  eventModal(ui, {
    emoji: '👋', title: name, text: t('ev_neighbour_q', { task, g }),
    buttons: [
      { label: t('ev_neighbour_yes'), primary: true, run: onYes },
      { label: t('ev_later') },
    ],
  });
}

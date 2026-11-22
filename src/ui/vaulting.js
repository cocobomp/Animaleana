// Interface de la voltige (src/game/Vaulting.js) : pendant la séance, le gros bouton rond entouré de l'anneau du
// rythme (il se resserre et bat avec la foulée : toucher quand il touche le bouton), la carte de la figure à faire,
// la jauge d'équilibre (glisser le doigt), et les notes des trois juges ; à la fin, le protocole des notes. Aussi le
// choix du niveau (tonneau, pas, galop) et du cheval, dans le menu des activités.

import './vaulting.css';
import { h } from './dom.js';
import { t, ta, getLang } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { GEAR, freeStock, sizeFor, wears } from '../sim/gear.js';
import { VAULT_LEVELS, LEVEL_IDS, FIGURES, PROGRAM, BALANCE_ZONE, vaultBlock, vaultData, canterUnlocked, CANTER_UNLOCK, figuresOnHorse } from '../sim/vaulting.js';
import { awardEl } from './activities.js';

/** Une note dans la langue du joueur : « 7,5 » en français, « 7.5 » en anglais. */
export function fmtMark(n, digits = 1) {
  const s = (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.0+$/, '');
  return getLang() === 'fr' ? s.replace('.', ',') : s;
}

// ---------------------------------------------------------------- pendant la séance

/** Penché qui envoie la bulle tout au bout de la jauge d'équilibre. */
export const GAUGE_RANGE = BALANCE_ZONE * 3.3;

/** Place de la bulle sur la jauge (% de la largeur, 50 au milieu) pour un penché donné. */
export const gaugeAt = (lean) => 50 + Math.max(-1, Math.min(1, lean / GAUGE_RANGE)) * 46;

/** La zone verte dessinée : exactement la vraie zone d'équilibre ([gauche, droite] en %). */
export const GAUGE_ZONE = [gaugeAt(-BALANCE_ZONE), gaugeAt(BALANCE_ZONE)];

/**
 * Ce que la séance ajoute à la barre des activités (ActivityHud) : une couche qui reçoit le doigt (toucher, glisser),
 * le bouton rond du rythme, la carte de la figure, la jauge d'équilibre et le panneau des juges.
 * cb : { onTap(ts), onDrag(dx) } (ts : heure du toucher, en ms ; dx : part de la largeur de l'écran, × 3,5).
 */
export class VaultHud {
  constructor(hud, cb) {
    this.hud = hud;
    this.cb = cb;
    // La couche du doigt : tout l'écran, sous la barre du haut et les boutons.
    this.pad = h('div', { class: 'vt-pad' });
    let lastX = null;
    this.pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lastX = e.clientX;
      this.pad.setPointerCapture?.(e.pointerId);
      cb.onTap(e.timeStamp);
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (lastX === null) return;
      const dx = (e.clientX - lastX) / Math.max(240, window.innerWidth) * 3.5;
      lastX = e.clientX;
      cb.onDrag(dx);
    });
    const up = () => { lastX = null; };
    this.pad.addEventListener('pointerup', up);
    this.pad.addEventListener('pointercancel', up);
    hud.root.prepend(this.pad);
    // Le bouton rond et son anneau.
    this.ringEl = h('span', { class: 'vt-ring' });
    this.icoEl = h('span', { class: 'vt-ico' }, '🤸');
    this.btn = h('button', {
      class: 'vt-btn',
      'aria-label': t('vt_tapBtn'),
      onPointerdown: (e) => { e.preventDefault(); e.stopPropagation(); cb.onTap(e.timeStamp); },
    }, this.ringEl, h('span', { class: 'vt-target' }), this.icoEl);
    this.cardEl = h('div', { class: 'vt-card', hidden: true });
    // La jauge d'équilibre.
    this.bubble = h('span', { class: 'vt-bubble' }, '🤸');
    this.gauge = h('div', { class: 'vt-balance', hidden: true },
      h('div', { class: 'vt-balance-say' }, `⬅️ ${t('vt_balanceSay')} ➡️`, h('kbd', { class: 'vt-kbd' }, '← →')),
      h('div', { class: 'vt-balance-bar' },
        h('span', { class: 'vt-balance-zone', style: `left:${GAUGE_ZONE[0].toFixed(2)}%;width:${(GAUGE_ZONE[1] - GAUGE_ZONE[0]).toFixed(2)}%` }),
        this.bubble));
    this.box = h('div', { class: 'vt-controls' }, this.cardEl, this.gauge, h('div', { class: 'vt-btn-row' }, this.btn, h('small', { class: 'vt-btn-say' }, t('vt_tapSay'), h('kbd', { class: 'vt-kbd' }, t('actv_key_space')))));
    hud.controls.append(this.box);
    // Les notes des juges.
    this.marksEl = h('div', { class: 'vt-marks', hidden: true });
    hud.root.append(this.marksEl);
  }

  /** L'anneau à la phase de la foulée (0 → 1) : il se resserre, et touche le bouton au début de chaque foulée. */
  ring(phase) {
    const k = 1 + 0.9 * phase; // (de grand à petit, puis il recommence)
    this.ringEl.style.transform = `scale(${(k > 1.85 ? 1 : 2.9 - k).toFixed(3)})`;
    this.ringEl.style.opacity = phase > 0.92 || phase < 0.08 ? '1' : (0.35 + 0.6 * phase).toFixed(2);
  }

  /** Le temps tombe : petit éclair sur le bouton. */
  beat() {
    this.btn.classList.remove('vt-beat');
    void this.btn.offsetWidth;
    this.btn.classList.add('vt-beat');
  }

  /**
   * La figure à faire (null : rien à toucher maintenant). part / parts : le temps en cours d'une figure en plusieurs
   * temps (le moulin en quatre), montrés par des points : ceux déjà faits en vert, celui à faire en doré.
   */
  cue(icon, label, how, part = 0, parts = 1) {
    if (!icon) {
      this.cardEl.hidden = true;
      this.btn.classList.add('vt-idle');
      return;
    }
    this.icoEl.textContent = icon;
    this.btn.classList.remove('vt-idle');
    const dots = parts > 1
      ? h('span', { class: 'vt-dots', role: 'img', 'aria-label': `${part + 1}/${parts}` },
        Array.from({ length: parts }, (_, i) => h('i', { class: i < part ? 'done' : i === part ? 'now' : '' })))
      : null;
    this.cardEl.replaceChildren(h('b', {}, `${icon} ${label}`, dots), how ? h('small', {}, how) : null);
    this.cardEl.hidden = false;
  }

  /** Rien à toucher pendant un moment (le salut de la fin) : le bouton rond disparaît. */
  idle(on) {
    this.box.hidden = on;
  }

  balance(on) {
    this.gauge.hidden = !on;
    this.btn.parentElement.hidden = on;
    if (on) this.cardEl.hidden = true;
  }

  /** La bulle au penché lean (verte dans la zone d'équilibre, la même que la zone dessinée). */
  setBalance(lean) {
    this.bubble.style.left = `${gaugeAt(lean).toFixed(1)}%`;
    this.bubble.classList.toggle('ok', Math.abs(lean) <= BALANCE_ZONE);
  }

  /** Les trois notes des juges, la note retenue et le petit mot. */
  marks(icon, name, marks, score, say) {
    this.marksEl.replaceChildren(
      h('div', { class: 'vt-marks-head' }, h('span', {}, `${icon} ${name}`), h('b', { class: 'vt-marks-score' }, fmtMark(score))),
      h('div', { class: 'vt-marks-judges' }, marks.map((m, i) => h('span', { class: 'vt-judge' }, h('small', {}, `🧑‍⚖️ ${'ABC'[i]}`), h('b', {}, fmtMark(m))))),
      h('div', { class: 'vt-marks-say' }, say));
    this.marksEl.hidden = false;
    this.marksEl.classList.remove('vt-in');
    void this.marksEl.offsetWidth;
    this.marksEl.classList.add('vt-in');
    clearTimeout(this.marksTimer);
    this.marksTimer = setTimeout(() => { this.marksEl.hidden = true; }, 4200);
  }

  remove() {
    clearTimeout(this.marksTimer);
    this.pad.remove();
    this.box.remove();
    this.marksEl.remove();
  }
}

// ---------------------------------------------------------------- les résultats

/**
 * Fenêtre des résultats : la note finale, les étoiles, le protocole (les trois juges pour chaque figure), et ce
 * que la séance a apporté. r : { level, result, animal, record, unlockedCanter, newFigures, horse, award, onAgain, onClose }.
 */
export function showVaultResults(ui, r) {
  const res = r.result;
  const close = (fn) => () => { ui.hideModal(); fn?.(); };
  const lines = [];
  if (r.record) lines.push(h('li', { class: 'good' }, `🎖️ ${t('vt_record', { level: t(`vt_level_${r.level}`) })}`));
  if (r.unlockedCanter) lines.push(h('li', { class: 'good' }, `🐎 ${t('vt_canterUnlocked')}`));
  const nf = r.newFigures ?? [];
  if (nf.length === 1) lines.push(h('li', { class: 'good' }, `${FIGURES[nf[0]].icon} ${t('vt_newFigure', { fig: t(`vt_fig_${nf[0]}`) })}`));
  else if (nf.length) lines.push(h('li', { class: 'good' }, `${nf.map((id) => FIGURES[id].icon).join(' ')} ${t('vt_newFigures', { n: nf.length })}`));
  if (res.best) lines.push(h('li', {}, `✨ ${t('vt_best', { fig: t(`vt_fig_${res.best.id}`), n: fmtMark(res.best.score) })}`));
  if (res.worst && res.worst.score < Math.min(8, res.best.score)) lines.push(h('li', {}, `💭 ${t(`vt_tip_${res.worst.comment}`, { fig: t(`vt_fig_${res.worst.id}`) })}`));
  if (r.animal && r.horse) lines.push(h('li', {}, `${SPECIES.horse.emoji} ${ta('vt_horseFx', r.animal, { n: r.horse.obedience })}`));
  const title = res.stars === 3 ? t('vt_resBravo') : res.stars === 2 ? t('vt_resGood') : t('vt_resTry');
  const who = r.animal ? `${SPECIES.horse.emoji} ${r.animal.name} · ${VAULT_LEVELS[r.level].icon} ${t(`vt_level_${r.level}`)}` : `${VAULT_LEVELS.barrel.icon} ${t(`vt_level_${r.level}`)}`;
  ui.showModal([
    h('div', { class: 'actv-result vt-result' },
      h('h2', {}, `🤸 ${title}`),
      h('div', { class: 'actv-stars', 'aria-label': `${res.stars}/3` }, [0, 1, 2].map((i) => h('span', { class: i < res.stars ? 'on' : '' }, '★'))),
      h('p', { class: 'actv-who' }, who),
      h('div', { class: 'vt-total' }, h('b', {}, fmtMark(res.score, 2)), h('small', {}, ' / 10')),
      h('table', { class: 'actv-table vt-protocol' },
        h('thead', {}, h('tr', {}, h('th', {}, t('vt_colFigure')), h('th', {}, '🧑‍⚖️ A'), h('th', {}, 'B'), h('th', {}, 'C'), h('th', {}, t('vt_colScore')))),
        h('tbody', {}, res.figures.map((f) => h('tr', {},
          h('td', {}, `${FIGURES[f.id].icon} ${t(`vt_fig_${f.id}`)}`),
          f.marks.map((m) => h('td', { class: 'num' }, fmtMark(m))),
          h('td', { class: 'num' }, h('b', {}, fmtMark(f.score))))))),
      lines.length ? h('ul', { class: 'actv-lines' }, lines) : null,
      r.award ? h('div', { class: 'actv-won' }, awardEl(r.award, true), h('b', {}, t('actv_wonRibbon'))) : null,
      h('div', { class: 'row end' },
        r.onAgain ? h('button', { onClick: close(r.onAgain) }, `🔁 ${t('actv_again')}`) : null,
        h('button', { class: 'primary', onClick: close(r.onClose) }, t('actv_done')))),
  ]);
}

// ---------------------------------------------------------------- choisir le niveau et le cheval

/** Peut-on lui mettre tout de suite le surfaix et le tapis rangés à la sellerie ? */
const spareVaultGear = (g, a) => ['surcingle', 'vaultPad'].every((id) => wears(a, id) || freeStock(g.profile, id, sizeFor(id, a)) > 0);

/**
 * La voltige dans le menu des activités : les trois niveaux (le tonneau est toujours là ; au pas, puis au galop,
 * avec un cheval qui a son surfaix et son tapis), et pour chaque cheval d'ici, s'il peut et sinon pourquoi.
 * state : { vtLevel } (le niveau choisi). Renvoie des éléments.
 */
export function vaultingPick(ui, state) {
  const g = ui.game;
  const p = g.profile;
  const d = vaultData(p);
  const level = state.vtLevel ?? (canterUnlocked(p) ? 'canter' : 'walk');
  state.vtLevel = level;
  const out = [h('p', { class: 'note' }, t('vt_intro'))];
  // Les trois niveaux, comme des onglets.
  out.push(h('div', { class: 'vt-levels' }, LEVEL_IDS.map((id) => {
    const locked = id === 'canter' && !canterUnlocked(p);
    const best = d.best[id];
    return h('button', {
      class: `card vt-level ${id === level ? 'vt-sel' : ''} ${locked ? 'locked' : ''}`,
      onClick: () => {
        if (id === 'barrel') return g.activities.start('vaulting', { level: 'barrel' });
        if (locked) ui.toast(t('vt_why_canterLocked', { n: CANTER_UNLOCK }), 4500);
        state.vtLevel = id;
        ui.renderPanel();
      },
    },
    h('span', { class: 'card-emoji' }, locked ? '🔒' : VAULT_LEVELS[id].icon),
    h('span', { class: 'card-main' }, h('b', {}, t(`vt_level_${id}`)), h('small', {}, t(`vt_levelDesc_${id}`))),
    h('span', { class: 'card-side' }, best ? h('small', {}, `⭐ ${fmtMark(best)}`) : id === 'barrel' ? '▶️' : null));
  })));
  // Les chevaux, au niveau choisi.
  const horses = g.animalsHere().filter((a) => a.species === 'horse' && !a.client && !a.guest);
  if (!horses.length) out.push(h('p', { class: 'warn' }, t('vt_noHorse')));
  out.push(h('div', { class: 'cards' }, horses.map((a) => {
    const why = vaultBlock(a, level, p);
    const gearWhy = why === 'noSurcingle' || why === 'noVaultPad';
    const canPut = gearWhy && spareVaultGear(g, a);
    return h('div', { class: `card vt-horse ${why && !canPut ? 'locked' : ''}` },
      h('span', { class: 'card-emoji' }, SPECIES.horse.emoji),
      h('span', { class: 'card-main' }, h('b', {}, a.name),
        why ? h('small', {}, canPut ? ta('vt_putGearHint', a) : ta(`vt_why_${why}`, a, { n: CANTER_UNLOCK })) : h('small', {}, ta('vt_ready', a))),
      h('span', { class: 'card-side' },
        !why ? h('button', { class: 'primary', onClick: () => g.activities.start('vaulting', { animal: a, level }) }, `▶️ ${t('vt_go')}`)
          : canPut ? h('button', { class: 'primary', onClick: () => { g.equip(a, 'vaultPad'); g.equip(a, 'surcingle'); ui.toast(ta('vt_gearOn', a), 3000); ui.renderPanel(); } }, `${GEAR.surcingle.emoji} ${t('vt_putGear')}`)
            : gearWhy ? h('button', { onClick: () => ui.openTack({ tab: 'vaulting' }) }, `🏇 ${t('vt_toShop')}`) : '🔒'));
  })));
  // Les figures déjà réussies à cheval (pour la quête « toutes les figures »).
  const okFigs = figuresOnHorse(p);
  out.push(h('div', { class: 'vt-figs' }, PROGRAM.map((id) => h('span', { class: `vt-fig ${okFigs.includes(id) ? 'ok' : ''}`, title: t(`vt_fig_${id}`) }, `${FIGURES[id].icon} ${t(`vt_fig_${id}`)}`))));
  return out;
}

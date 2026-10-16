// Examen vétérinaire « comme un vrai véto » (simplifié) : l'animal en grand (src/ui/vetStage.js),
// la trousse d'outils (🩺 🌡️ 🔦 🦷 👆 ⚖️ 👣), le carnet où chaque mesure s'écrit (✅ normal /
// ⚠️ anormal, avec la norme de l'espèce rappelée), puis le diagnostic (les maladies compatibles
// avec les signes trouvés), le traitement et le suivi.
// Logique pure : src/sim/vetExam.js. Utilisé par la clinique, la visite à domicile, la trousse de
// premiers secours, les clients « soins » du métier et les leçons de l'école (src/ui/vetSchool.js).

import { h } from './dom.js';
import { t, ta, getLang } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { canAfford } from '../sim/profile.js';
import { isStarted } from '../sim/careers.js';
import { lessonsDoneCount, LESSONS } from '../sim/vetSchool.js';
import {
  TOOLS, MEASURES, ILLNESS_IDS, TREATMENTS, BODY_SIGNS, makeCase, evaluate, signsFound, compatibleDiagnoses, isRightDiagnosis,
  missingExam, treatmentFor, doseFor,
} from '../sim/vetExam.js';
import { VetStage } from './vetStage.js';
import './vetExam.css';

export const ILL_EMOJI = { healthy: '💚', ear: '👂', paw: '🦵', belly: '🤢', cold: '🤧', flu: '🤒', fleas: '🦟' };
export const TREAT_EMOJI = { drops: '💧', bandage: '🩹', syrup: '💊', shampoo: '🧴', injection: '💉' };
const UNIT = { temp: '°C', heart: '/min', lungs: '/min', weight: 'kg' };

/** Nombre à la française (virgule) ou à l'anglaise. */
export function num(v) {
  const s = Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1);
  return getLang() === 'fr' ? s.replace('.', ',') : s;
}

/** Le nom de la maladie (ou « en bonne santé »). */
export const illName = (id) => t(`vx_ill_${id}`);

/** La norme rappelée sous une mesure (« normale : 37,2–38,3 °C »). */
function normText(r) {
  if (!r.norm) return '';
  if (r.measure === 'crt') return t('vx_norm_crt');
  const u = UNIT[r.measure] ?? '';
  const key = r.measure === 'lungs' ? 'vx_norm_resp' : r.measure === 'weight' ? 'vx_norm_weight' : 'vx_norm';
  return t(key, { lo: num(r.norm[0]), hi: num(r.norm[1]), u });
}

/** Une ligne du carnet à partir d'un résultat de evaluate(). */
export function noteLine(a, r) {
  const m = MEASURES[r.measure];
  let value;
  let detail = '';
  switch (r.measure) {
    case 'heart':
      value = `${r.value} /min`;
      detail = r.assisted ? t('vx_heart_helped') : t(r.slowmo > 1 ? 'vx_heart_calcSlow' : 'vx_heart_calc', { c: r.count, v: r.value });
      break;
    case 'temp': value = `${num(r.value)} °C`; break;
    case 'lungs':
      value = t(`vx_lungs_${r.state}`);
      detail = t('vx_resp', { v: r.value });
      break;
    case 'crt': value = `${num(r.value)} s`; break;
    case 'weight':
      value = `${num(r.value)} kg`;
      detail = t(`vx_weight_${r.state}`);
      break;
    case 'gait': value = ta(`vx_gait_${r.state}`, a, { leg: t(`vx_leg_${r.leg ?? 'front'}`) }); break;
    default: value = ta(`vx_${r.measure}_${r.state}`, a);
  }
  const verdict = r.status === 'bad' ? r.signs.map((s) => t(`vx_sign_${s}`)).join(', ') : t('vx_normal');
  return { icon: m.emoji, label: t(`vx_m_${r.measure}`), value, detail, norm: normText(r), status: r.status, verdict };
}

function noteEl(line) {
  return h('li', { class: `vx-note ${line.status}` },
    h('span', { class: 'vx-note-ico' }, line.icon),
    h('span', { class: 'vx-note-main' },
      h('b', {}, line.label), h('span', { class: 'vx-note-val' }, line.value),
      line.detail ? h('small', {}, line.detail) : null,
      line.norm ? h('small', { class: 'vx-note-norm' }, `📏 ${line.norm}`) : null),
    line.status === 'info' ? null : h('span', { class: `vx-badge ${line.status}` }, line.status === 'bad' ? `⚠️ ${line.verdict}` : `✅ ${line.verdict}`));
}

/**
 * La vue d'examen : scène + trousse + consigne (work) et le carnet (notes).
 * o : { a, cs, tools (ids, par défaut toute la trousse), tasks (mesures à faire : leçon),
 *       intro (texte de la consigne au début), observe (true : l'observation en tête du carnet),
 *       onMeasure(r, first), onTasksDone() }
 * Renvoie { work, notes, results, stage, setTool, destroy }.
 */
export function createExamView(ui, o) {
  const { a, cs } = o;
  const results = new Map();
  const toolIds = o.tools ?? TOOLS.map((x) => x.id);
  const hintEl = h('p', { class: 'vx-hint', 'aria-live': 'polite' });
  const listEl = h('ul', { class: 'vx-notes-list' });
  const tasksEl = o.tasks ? h('div', { class: 'vx-tasks' }) : null;
  let tasksDone = false;
  let current = null;

  const setHint = (text, kind = '') => {
    if (hintEl.textContent !== text) {
      hintEl.textContent = text;
      hintEl.classList.remove('flash');
      void hintEl.offsetWidth;
      hintEl.classList.add('flash');
    }
    hintEl.dataset.kind = kind;
  };

  const renderNotes = () => {
    const items = [];
    if (o.observe !== false) items.push(noteEl({ icon: '👀', label: t('vx_obs'), value: ta(`vx_look_${cs.look}`, a), status: 'info' }));
    for (const r of results.values()) items.push(noteEl(noteLine(a, r)));
    if (!results.size) items.push(h('li', { class: 'vx-note empty' }, t('vx_notebookEmpty')));
    listEl.replaceChildren(...items);
    listEl.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  };

  const renderTasks = () => {
    if (!tasksEl) return;
    tasksEl.replaceChildren(h('b', {}, t('vs_tasks')), ...o.tasks.map((m) => h('span', { class: `vx-task ${results.has(m) ? 'done' : ''}` },
      `${results.has(m) ? '✅' : '⬜'} ${MEASURES[m].emoji} ${t(`vx_m_${m}`)}`)));
    if (!tasksDone && o.tasks.every((m) => results.has(m))) {
      tasksDone = true;
      setTimeout(() => o.onTasksDone?.(), 900);
    }
  };

  const toolBtns = new Map();
  const toolDone = (tool) => Object.keys(MEASURES).filter((m) => MEASURES[m].tool === tool && (!o.tasks || o.tasks.includes(m)))
    .every((m) => results.has(m));
  const renderTools = () => {
    for (const [id, b] of toolBtns) {
      b.classList.toggle('active', current === id);
      b.classList.toggle('done', toolDone(id));
    }
  };

  const stage = new VetStage(a, cs, {
    measure: (id, input) => {
      const r = evaluate(cs, id, input);
      if (!r || r.retry) return r;
      const first = !results.has(id);
      results.set(id, r);
      renderNotes();
      const line = noteLine(a, r);
      // Les mesures chiffrées disent aussi la conclusion (« 39,7 °C ⚠️ fièvre ») ; les autres, juste ✅ / ⚠️.
      const numeric = ['heart', 'temp', 'crt', 'weight'].includes(id);
      const verdict = r.status === 'bad' ? `⚠️${numeric ? ` ${line.verdict}` : ''}` : `✅${numeric ? ` ${t('vx_normal')}` : ''}`;
      setHint(`${line.icon} ${line.label} : ${line.value} ${verdict}`, r.status === 'bad' ? 'warn' : 'good');
      renderTools();
      renderTasks();
      o.onMeasure?.(r, first);
      return r;
    },
    hint: setHint,
    doneOf: (m) => results.get(m)?.status ?? null,
  });

  const setTool = (id) => {
    current = id;
    stage.setTool(id);
    renderTools();
  };

  const tools = h('div', { class: `vx-tools ${toolIds.length < 3 ? 'few' : ''}`, role: 'toolbar', style: { gridTemplateColumns: `repeat(${toolIds.length}, minmax(0, 1fr))` } },
    TOOLS.filter((x) => toolIds.includes(x.id)).map((x) => {
      const b = h('button', { class: 'vx-tool', type: 'button', 'aria-label': t(`vx_toolLong_${x.id}`), title: t(`vx_toolLong_${x.id}`), onClick: () => setTool(current === x.id ? null : x.id) },
        h('span', { class: 'vx-tool-ico' }, x.emoji), h('span', { class: 'vx-tool-name' }, t(`vx_tool_${x.id}`)));
      toolBtns.set(x.id, b);
      return b;
    }));

  setHint(o.intro ?? t('vx_h_start'));
  renderNotes();
  renderTasks();
  if (toolIds.length === 1) setTool(toolIds[0]);

  const work = h('div', { class: 'vx-work' }, stage.el, tools, hintEl);
  const notes = h('div', { class: 'vx-notes' }, h('b', { class: 'vx-notes-title' }, `📒 ${t('vx_notebook')}`), tasksEl, listEl);
  const view = {
    work, notes, results, stage, setTool, setHint,
    destroy: () => {
      stage.destroy();
      if (ui.examView === view) ui.examView = null;
    },
  };
  ui.examView = view; // la dernière vue d'examen ouverte (lisible par les tests automatiques)
  return view;
}

// ------------------------------------------------------------------ fenêtre plein écran

/**
 * Cadre commun (examen et leçons) : fenêtre par-dessus le jeu 3D, croix, Échap.
 * Renvoie { box, body, head, close, setTitle }. onClose est appelé une fois.
 */
export function openOverlay(ui, { title, sub = '', cls = '', onClose }) {
  const g = ui.game;
  const prevInput = g?.input?.enabled ?? true;
  if (g?.input) g.input.enabled = false;
  document.activeElement?.blur?.();
  const titleEl = h('span', {}, title);
  const subEl = h('small', {}, sub);
  const closeBtn = h('button', { class: 'vx-close', type: 'button', 'aria-label': t('close'), title: t('close') }, '✕');
  const head = h('header', { class: 'vx-head' }, h('div', { class: 'vx-title' }, titleEl, subEl), closeBtn);
  const body = h('div', { class: 'vx-body' });
  const box = h('div', { class: `vx-box ${cls}` }, head, body);
  const overlay = h('div', { class: 'vx-overlay', role: 'dialog', 'aria-modal': 'true' }, box);
  ui.root.append(overlay);
  document.body.classList.add('vx-open');
  // Téléphone : la fenêtre couvre tout l'écran, le jeu 3D n'a pas besoin d'être dessiné derrière.
  const cover = !!window.matchMedia?.('(max-width: 640px), (max-height: 480px)').matches;
  if (cover) ui.vxCover = (ui.vxCover ?? 0) + 1;
  ui.vxOpen = (ui.vxOpen ?? 0) + 1; // pas de visiteur ni d'événement pendant l'examen (ui.isBlocking)
  let closed = false;
  const onKey = (e) => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      close();
    } else if (!['Space', 'Tab', 'Enter'].includes(e.code)) {
      e.stopPropagation(); // les flèches et WASD ne vont pas au jeu 3D
    }
  };
  window.addEventListener('keydown', onKey, true);
  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (cover) ui.vxCover = Math.max(0, (ui.vxCover ?? 1) - 1);
    ui.vxOpen = Math.max(0, (ui.vxOpen ?? 1) - 1);
    if (!document.querySelector('.vx-overlay')) document.body.classList.remove('vx-open');
    if (g?.input) g.input.enabled = prevInput;
    onClose?.();
  }
  closeBtn.addEventListener('click', close);
  return {
    overlay, box, body, head, close, closeBtn,
    setTitle: (tt, s = '') => { titleEl.textContent = tt; subEl.textContent = s; },
  };
}

// ------------------------------------------------------------------ l'examen complet

/**
 * Ouvre l'examen. mode : 'clinic' (à la clinique), 'home' (le vétérinaire vient), 'self' (trousse),
 * 'career' (animal confié par un client : c'est toi le docteur, gratuit).
 */
export function openVetExam(ui, a, mode = 'clinic') {
  const g = ui.game;
  const p = g.profile;
  const free = mode === 'self' || mode === 'career';
  const cost = free ? 0 : g.vetCost(mode === 'clinic');
  if (!canAfford(p, cost)) {
    ui.toast(t('r_money'));
    return null;
  }
  const isVet = isStarted(p, 'vet');
  const cs = makeCase(a);
  const sp = SPECIES[a.species];
  const st = { step: 'exam', msg: '', msgKind: '', dxMistakes: 0, txMistakes: 0, illness: cs.illness, finished: false };
  const whoKey = { clinic: 'vx_who_clinic', home: 'vx_who_home', self: 'vx_who_self', career: 'vx_who_career' }[mode];
  const ov = openOverlay(ui, {
    title: `🩺 ${t(mode === 'self' ? 'vetSelfTitle' : 'vx_title')}`,
    sub: `${sp.emoji} ${a.name} · ${t(whoKey, { n: cost, g: a.sex })}`,
    cls: 'vx-exam',
    onClose: () => {
      view.destroy();
      clearInterval(watch);
      if (ui.vetExam?.animalId === a.id) ui.vetExam = null;
    },
  });
  const view = createExamView(ui, {
    a,
    cs,
    onMeasure: (r, first) => {
      if (first && a.client?.kind === 'vet') g.clients?.noteCareer?.('vet', 'exam'); // carnet du métier
      renderFoot();
    },
  });
  const panel = h('div', { class: 'vx-panel', hidden: true });
  const foot = h('div', { class: 'vx-foot' });
  const side = h('div', { class: 'vx-side' }, view.notes, foot);
  const main = h('div', { class: 'vx-main' }, view.work, panel, side);
  ov.body.append(main);

  // L'animal est parti (rendu à son propriétaire, voyage…) : on ferme sans rien appliquer.
  const watch = setInterval(() => {
    if (!g.profile || !g.profile.animals.some((x) => x.id === a.id)) ov.close();
  }, 1000);

  const setStep = (step) => {
    st.step = step;
    st.msg = '';
    ov.box.dataset.step = step;
    const exam = step === 'exam';
    view.work.hidden = !exam;
    view.stage.pause(!exam);
    panel.hidden = exam;
    render();
  };

  function renderFoot() {
    const n = view.results.size;
    if (st.step !== 'exam') {
      foot.replaceChildren();
      return;
    }
    foot.replaceChildren(h('button', { class: 'primary big vx-go', disabled: n < 2, onClick: () => setStep('diag') },
      n < 2 ? `${t('vx_needMore')} (${n}/2)` : `🧠 ${t('vx_toDiag')}`));
  }

  const msgEl = () => (st.msg ? h('p', { class: `vx-msg ${st.msgKind}` }, st.msg) : null);

  function render() {
    renderFoot();
    if (st.step === 'exam') return;
    let out = [];
    if (st.step === 'diag') out = diagPanel();
    else if (st.step === 'treat') out = treatPanel();
    else if (st.step === 'care') out = carePanel();
    else if (st.step === 'checkup') out = checkupPanel();
    else if (st.step === 'end') out = endPanel();
    panel.replaceChildren(...out.filter(Boolean));
    panel.scrollTop = 0;
  }

  function diagPanel() {
    const signs = signsFound([...view.results.values()]);
    const dx = compatibleDiagnoses(signs);
    const chips = signs.length
      ? h('div', { class: 'vx-chips' }, signs.map((s) => h('span', { class: `vx-chip ${BODY_SIGNS.includes(s) ? 'body' : ''}` }, `⚠️ ${t(`vx_sign_${s}`)}`)))
      : h('p', { class: 'note' }, t('vx_dx_noSign'));
    const cards = dx.map((d, i) => h('button', { class: `vx-dx ${i === 0 ? 'best' : ''}`, onClick: () => choose(d.id) },
      h('span', { class: 'vx-dx-emoji' }, ILL_EMOJI[d.id]),
      h('span', { class: 'vx-dx-main' }, h('b', {}, illName(d.id)),
        d.matched.length ? h('small', {}, t('vx_dx_matches', { list: d.matched.map((s) => t(`vx_sign_${s}`)).join(', ') })) : h('small', {}, t('vx_dx_allNormal'))),
      i === 0 && dx.length > 1 ? h('span', { class: 'vx-dx-tag' }, t('vx_dx_best')) : null));
    const others = ['healthy', ...ILLNESS_IDS].filter((id) => !dx.some((d) => d.id === id));
    return [
      h('h3', {}, `🧠 ${ta('vx_dx_title', a)}`),
      h('p', { class: 'vx-sub' }, t('vx_dx_signs')),
      chips,
      h('p', { class: 'vx-sub' }, t(dx.length > 1 ? 'vx_dx_compatible' : 'vx_dx_compatibleOne')),
      h('div', { class: 'vx-dx-list' }, cards),
      msgEl(),
      others.length ? h('details', { class: 'vx-others' }, h('summary', {}, t('vx_dx_others')),
        h('div', { class: 'vx-other-grid' }, others.map((id) => h('button', { class: 'small', onClick: () => choose(id) }, `${ILL_EMOJI[id]} ${illName(id)}`)))) : null,
      h('button', { class: 'vx-back', onClick: () => setStep('exam') }, `↩ ${t('vx_dx_back')}`),
    ];
  }

  function choose(id) {
    if (isRightDiagnosis(cs, id)) {
      setStep(id === 'healthy' ? 'checkup' : 'treat');
      st.msg = `✅ ${t('vetRightDiag')}`;
      st.msgKind = 'good';
      render();
      return;
    }
    st.dxMistakes++;
    const miss = missingExam(cs, [...view.results.keys()]);
    st.msg = `${t('vetNotSure')}${miss ? ` ${t('vx_dx_try', { exam: t(`vx_try_${miss}`) })}` : ''}`;
    st.msgKind = 'warn';
    render();
  }

  function treatPanel() {
    return [
      msgEl(),
      h('h3', {}, `${ILL_EMOJI[cs.illness]} ${t('vx_tx_title', { ill: illName(cs.illness) })}`),
      h('div', { class: 'vx-tx-grid' }, TREATMENTS.map((x) => h('button', { class: 'vx-tx', onClick: () => treat(x) },
        h('span', { class: 'vx-tx-emoji' }, TREAT_EMOJI[x]), h('b', {}, t(`treat_${x}`)), h('small', {}, t(`vx_txd_${x}`))))),
    ];
  }

  function treat(x) {
    if (x !== treatmentFor(cs.illness)) {
      st.txMistakes++;
      st.msg = t('vetWrong');
      st.msgKind = 'warn';
    } else if (mode === 'self' && x === 'injection' && !isVet) {
      st.msg = t('vetOnlyVet');
      st.msgKind = 'warn';
    } else {
      st.treatment = x;
      setStep('care');
      return;
    }
    render();
  }

  function carePanel() {
    const x = st.treatment;
    const weighed = view.results.get('weight');
    const dose = weighed ? doseFor(x, weighed.value) : null;
    return [
      h('div', { class: 'vx-success' }, h('span', { class: 'vx-big' }, TREAT_EMOJI[x]), h('b', {}, `✅ ${t('vx_tx_right')}`)),
      dose ? h('p', { class: 'vx-dose' }, `⚖️ ${t('vx_tx_dose', { kg: num(weighed.value), n: num(dose.amount) })}`)
        : doseFor(x, 10) ? h('p', { class: 'note' }, `⚖️ ${t('vx_tx_weighTip')}`) : null,
      h('div', { class: 'vx-follow' }, h('b', {}, `📋 ${t('vx_follow')}`), h('p', {}, ta(`vx_follow_${cs.illness}${cs.illness === 'belly' && a.species === 'horse' ? 'Horse' : ''}`, a))),
      h('button', { class: 'primary big', onClick: finish }, `💚 ${t('vx_tx_heal', { name: a.name })}`),
    ];
  }

  function checkupPanel() {
    return [
      msgEl(),
      h('div', { class: 'vx-success' }, h('span', { class: 'vx-big' }, '💚'), h('b', {}, t('vetAllGood'))),
      h('div', { class: 'vx-follow' }, h('b', {}, `📋 ${t('vx_follow')}`), h('p', {}, ta('vx_follow_healthy', a))),
      h('button', { class: 'primary big', onClick: finish }, mode === 'self' ? `💚 ${t('vetFinish')}` : `💉 ${t('vetVaccine')}`),
    ];
  }

  function finish() {
    if (st.finished) return;
    st.finished = true;
    const wasSick = !!a.sick;
    if (mode === 'self') g.selfCare(a);
    else if (mode === 'career') {
      g.selfCare(a);
      ui.toast(ta(wasSick ? 'vetCured' : 'vetCheckupDone', a));
    } else g.vetDone(a, mode === 'clinic');
    st.wasSick = wasSick;
    setStep('end');
  }

  function endPanel() {
    const mistakes = st.dxMistakes + st.txMistakes;
    const stars = mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
    const lines = [
      h('li', {}, `📒 ${t('vx_end_exams', { n: view.results.size })}`),
      h('li', {}, st.dxMistakes === 0 ? `🧠 ${t('vx_end_firstTry')}` : `🧠 ${t('vx_end_found')}`),
    ];
    const learn = lessonsDoneCount(p) < LESSONS.length;
    return [
      h('div', { class: 'vx-end' },
        h('div', { class: 'vx-end-emoji' }, '💚'),
        h('div', { class: 'mg-stars', 'aria-label': `${stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off' }, '★'))),
        h('p', { class: 'big-text' }, ta(st.wasSick ? 'vetCured' : 'vetCheckupDone', a)),
        h('ul', { class: 'vx-end-lines' }, lines)),
      learn ? h('button', { class: 'vx-back', onClick: () => { ov.close(); ui.openVetSchool?.(); } }, `🎓 ${t('vx_end_school')}`) : null,
      h('button', { class: 'primary big', onClick: () => ov.close() }, t('close')),
    ];
  }

  setStep('exam');
  ui.vetExam = { animalId: a.id, cs, view, close: ov.close, get step() { return st.step; }, choose, treat, finish };
  return ui.vetExam;
}

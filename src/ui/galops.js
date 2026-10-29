// 🎓 Les Galops : le panneau (la pratique de chaque Galop, cochée au fur et à mesure) et l'examen en plein écran
// (5 questions, une réponse par question, l'explication après chaque réponse). La logique : src/sim/galops.js.
// On y vient depuis le terrain de concours (« Passer mes Galops ») et depuis la fiche du cheval.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { earn, isSandbox } from '../sim/profile.js';
import {
  GALOPS, EXAM_QUESTIONS, EXAM_PASS, galopDef, galopsSummary, galopLevel, canTakeExam, makeExam, isRight, finishExam, isOpen, logbook,
  galopsState,
} from '../sim/galops.js';
import { openOverlay } from './vetExam.js';
import { fmtCross } from '../sim/freeJumps.js'; // ⏱️ le record du cross

/** 🎓 Le diplôme d'un Galop obtenu : ton prénom, le cheval avec qui tu l'as passé, le jour. */
export function diplomaCard(ui, id) {
  const p = ui.game.profile;
  const def = galopDef(id);
  const horse = p.galopHorses?.[id] ?? null;
  return h('div', { class: `gl-diploma g${id}` },
    h('div', { class: 'gl-dip-top' }, `🎓 ${t('dip_title')}`),
    h('div', { class: 'gl-dip-galop' }, `${def.emoji} ${t('galop_n', { n: id })}`),
    h('div', { class: 'gl-dip-sub' }, t(`galop_sub_${id}`)),
    h('div', { class: 'gl-dip-name' }, p.name),
    horse ? h('div', { class: 'gl-dip-horse' }, t('dip_with', { name: horse })) : null,
    h('div', { class: 'gl-dip-day' }, t('dip_day', { n: galopsState(p)[id] ?? 1 })));
}

/** Le diplôme en grand (depuis le panneau des Galops). */
function showDiploma(ui, id) {
  ui.showModal([diplomaCard(ui, id),
    h('div', { class: 'row end' }, h('button', { class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, t('dip_close')))]);
}

export function openGalops(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🏅 ${t('galops_title')}`,
    kind: 'galops',
    render: () => {
      const p = g.profile;
      const list = galopsSummary(p);
      const level = galopLevel(p);
      const out = [h('div', { class: 'vs-head' },
        h('span', { class: 'vs-cap' }, '🏅'),
        h('div', { style: { flex: '1' } },
          h('b', {}, level === GALOPS.length ? t('galops_all') : level ? t('galops_level', { n: level }) : t('galops_level0')),
          h('div', { class: 'vs-progress' }, h('span', { style: { width: `${Math.round((level / GALOPS.length) * 100)}%` } }))))];
      out.push(h('p', { class: 'note' }, t('galops_help')));
      for (const x of list) {
        const head = h('div', { class: 'gl-head' },
          h('span', { class: 'vs-lesson-emoji' }, x.emoji),
          h('span', { style: { flex: '1' } }, h('b', {}, t('galop_n', { n: x.id })), h('small', {}, t(`galop_sub_${x.id}`))),
          h('span', { class: 'vs-lesson-side' }, x.done ? '✅' : !x.open ? '🔒' : isSandbox(p) ? '' : t('galop_reward', { coins: x.coins })));
        const body = [];
        if (x.done) {
          body.push(h('small', { class: 'note good' }, t('galop_got', { day: x.day })),
            h('button', { class: 'small gl-dip-btn', onClick: () => showDiploma(ui, x.id) }, `🎓 ${t('dip_see')}`));
        }
        else if (!x.open) body.push(h('small', { class: 'note' }, t('galop_locked', { n: x.id - 1 })));
        else {
          body.push(h('small', { class: 'gl-label' }, t('galop_practice')));
          body.push(h('ul', { class: 'gl-practice' }, x.practice.map((it) => h('li', { class: it.done ? 'done' : '' },
            h('span', {}, it.icon), h('span', {}, t(`gp_${it.id}`)), h('b', {}, it.done ? '✅' : `${it.have}/${it.n}`)))));
          body.push(h('small', { class: 'gl-label' }, t('galop_theory')));
          body.push(h('button', {
            class: `big ${x.ready ? 'primary' : ''} gl-take`, disabled: !x.ready, 'data-galop': x.id,
            onClick: () => openGalopExam(ui, x.id),
          }, t('galop_take')));
          if (!x.ready) body.push(h('small', { class: 'note' }, t('galop_needPractice')));
        }
        out.push(h('div', { class: `gl-card ${x.done ? 'done' : ''} ${x.open && !x.done ? 'open' : ''}` }, head, ...body));
      }
      // 📔 Le carnet du cavalier (ce qui a déjà commencé)
      const book = logbook(p);
      if (book.length) {
        out.push(h('h3', {}, t('lb_title')), h('ul', { class: 'gl-book' }, book.map((x) => h('li', {},
          h('span', {}, x.icon), h('span', {}, t(`lb_${x.id}`)), h('b', {}, x.time ? fmtCross(x.n) : String(x.n))))));
      }
      return out;
    },
  });
  g.emit('panel', 'galops');
}

/** L'examen d'un Galop (plein écran). Renvoie { get step, answer(i), close } (pour les tests). */
export function openGalopExam(ui, id) {
  const g = ui.game;
  const def = galopDef(id);
  if (!def || !canTakeExam(g.profile, id).ok) return null;
  const st = { step: 'quiz', q: 0, right: 0, exam: makeExam(id), answered: false };
  const ov = openOverlay(ui, {
    title: `${def.emoji} ${t('galop_n', { n: id })}`,
    sub: `🎓 ${t(`galop_sub_${id}`)}`,
    cls: 'vs-box',
    onClose: () => {
      if (ui.galopExam?.id === id) ui.galopExam = null;
      if (ui.panel?.kind === 'galops') ui.renderPanel();
    },
  });
  const body = h('div', { class: 'vs-lesson-body' });
  ov.body.append(body);

  function renderQuestion() {
    st.answered = false;
    const { k, order } = st.exam[st.q];
    const key = `gq_${id}_${k}`;
    const box = h('div', { class: 'vs-answers' });
    const why = h('div', {});
    const buttons = order.map((a) => h('button', {
      class: 'vs-answer', 'data-answer': a,
      onClick: () => answer(a),
    }, t(`${key}_a${a + 1}`)));
    box.append(...buttons);
    function answer(a) {
      if (st.answered) return;
      st.answered = true;
      const ok = isRight(id, k, a);
      if (ok) st.right++;
      // (on ne remplace pas les boutons sous le doigt : on change leurs classes)
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (isRight(id, k, order[i])) b.classList.add('right');
        else if (order[i] === a) b.classList.add('wrong');
      });
      const last = st.q + 1 >= st.exam.length;
      why.replaceChildren(
        h('p', { class: `vx-msg ${ok ? 'good' : 'warn'}` }, t(ok ? 'galop_right' : 'galop_wrong')),
        h('p', { class: 'vs-why' }, `💡 ${t(`${key}_why`)}`),
        h('button', { class: 'primary big gl-next', onClick: () => { if (last) renderDone(); else { st.q++; renderQuestion(); } } },
          t(last ? 'galop_see' : 'galop_next')));
    }
    st.answer = (i) => answer(order[i]);
    body.replaceChildren(h('small', { class: 'note' }, t('galop_qN', { n: st.q + 1, total: st.exam.length })),
      h('p', { class: 'vs-q' }, t(key)), box, why);
    body.scrollTop = 0;
  }

  function renderDone() {
    st.step = 'done';
    const p = g.profile;
    const r = finishExam(p, id, st.right, g.day);
    const score = h('p', { class: 'vs-why' }, t('galop_score', { right: st.right, total: EXAM_QUESTIONS }));
    const next = GALOPS.find((x) => x.id === id + 1);
    if (r?.passed) {
      earn(p, r.coins);
      const horse = g.mainHorse?.();
      if (horse) p.galopHorses = { ...(p.galopHorses ?? {}), [id]: horse.name }; // (sur le diplôme)
      g.remember?.(horse, `galop${id}`); // 📸 (un souvenir avec ton cheval)
      g.emit('galop', id);
      g.checkAcc = Infinity; // (quêtes et succès vérifiés tout de suite)
      g.save?.();
      ui.renderStatus?.();
      body.replaceChildren(h('div', { class: 'vs-done gl-done' },
        h('div', { class: 'vs-done-emoji' }, def.emoji),
        h('h2', {}, t('galop_passed', { n: id })),
        diplomaCard(ui, id),
        score,
        isSandbox(p) ? null : h('p', { class: 'vs-big-news' }, t('galop_reward', { coins: r.coins })), // (pièces illimitées : rien à gagner)
        h('p', { class: 'note' }, t('galop_passedMore')),
        h('div', { class: 'vs-actions' },
          next && isOpen(p, next.id) ? h('button', { class: 'primary big', onClick: () => { ov.close(); openGalops(ui); } },
            t('galop_nextGalop', { emoji: next.emoji, n: next.id })) : null,
          h('button', { class: 'big', onClick: () => ov.close() }, t('galop_back')))));
    } else {
      body.replaceChildren(h('div', { class: 'vs-done gl-done' },
        h('div', { class: 'vs-done-emoji' }, '📖'),
        score,
        h('p', { class: 'note' }, t('galop_failed', { pass: EXAM_PASS })),
        h('div', { class: 'vs-actions' },
          h('button', { class: 'primary big', onClick: () => { ov.close(); openGalopExam(ui, id); } }, t('galop_retry')),
          h('button', { class: 'big', onClick: () => ov.close() }, t('galop_back')))));
    }
  }

  renderQuestion();
  ui.galopExam = {
    id,
    get step() { return st.step; },
    get q() { return st.q; },
    get right() { return st.right; },
    /** Répond par le bouton i (0, 1 ou 2, dans l'ordre montré). */
    answer: (i) => st.answer(i),
    /** La bonne réponse de la question en cours : l'indice du bouton. */
    rightButton: () => st.exam[st.q].order.findIndex((a) => isRight(id, st.exam[st.q].k, a)),
    close: ov.close,
  };
  return ui.galopExam;
}

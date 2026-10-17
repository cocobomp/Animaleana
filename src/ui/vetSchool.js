// École vétérinaire : le panneau des leçons (✅, étoiles, diplôme) et chaque leçon en plein écran :
// 📖 j'apprends (explication illustrée) → ✋ je m'entraîne (petit exercice) → ❓ 2 ou 3 questions.
// La progression est dans src/sim/vetSchool.js ; les exercices « sur l'animal » réutilisent
// l'examen (src/ui/vetExam.js, src/ui/vetStage.js) avec une trousse réduite.
// On y vient depuis la clinique vétérinaire et depuis 💼 Métiers → Vétérinaire.

import { h } from './dom.js';
import { t, ta, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { createAnimal } from '../sim/animal.js';
import { isStarted, canStart, RANKS } from '../sim/careers.js';
import {
  LESSONS, LESSON_IDS, BASIC_IDS, lessonDef, schoolSummary, completeLesson, isUnlocked, quizStars, isRightAnswer, MASTER_XP, HEART_SORT,
} from '../sim/vetSchool.js';
import { VITALS, ILLNESS_IDS, TREATMENTS, makeCase, treatmentFor, classify, typicalHeartOf } from '../sim/vetExam.js';
import { createExamView, openOverlay, num, illName, ILL_EMOJI, TREAT_EMOJI } from './vetExam.js';
import { VetStage } from './vetStage.js';

const POINT_EMOJI = {
  vitals: ['🌡️', '❤️', '🫁', '📏'],
  stetho: ['❤️', '🫁', '🍽️', '⏱️'],
  thermo: ['🌡️', '⏳', '🔥', '🥶'],
  look: ['👁️', '👂', '🦷', '⏱️'],
  palpate: ['🤲', '🐾', '😣', '🔥'],
  hooves: ['🐴', '🪮', '🔨', '👣'],
  illness: ['🔎', '🤒', '🤢', '👂'],
  care: ['💊', '⚖️', '📋', '🧼'],
};
const SORT_ORDER = HEART_SORT; // du cœur le plus lent au plus rapide (cœur typique au repos)
const MATCH_SIGNS = {
  ear: ['earsRed', 'painEar'],
  paw: ['lame', 'painLeg'],
  belly: ['gutSilent', 'painBelly', 'gumsPale'],
  cold: ['noseRunny', 'wheeze', 'fever'],
  flu: ['fever', 'crackles', 'breathFast'],
  fleas: ['fleas'],
};
const THERMO_ROUNDS = [{ sp: 'horse', t: 38.9 }, { sp: 'dog', t: 38.5 }, { sp: 'rabbit', t: 37.6 }];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Les animaux de l'école, pour s'entraîner (ils ne sont pas dans le profil). */
function schoolAnimal(species, breed, name, sex, sick = null) {
  const a = createAnimal({ species, breed, name, sex, ageDays: 120, colorIndex: 0 });
  a.sick = sick;
  return a;
}

// ------------------------------------------------------------------ le panneau de l'école

export function openVetSchool(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🎓 ${t('vs_title')}`,
    kind: 'vetSchool',
    render: () => {
      const p = g.profile;
      const s = schoolSummary(p);
      const out = [h('div', { class: 'vs-head' },
        h('span', { class: 'vs-cap' }, '🎓'),
        h('div', { style: { flex: '1' } },
          h('b', {}, t('vs_progress', { n: s.done, total: s.total })),
          h('small', {}, t('vs_basics', { n: s.basicsDone, total: s.basicsTotal })),
          h('div', { class: 'vs-progress' }, h('span', { style: { width: `${Math.round((s.done / s.total) * 100)}%` } }))))];
      out.push(h('p', { class: 'note' }, t('vs_help', { n: s.total })));
      if (s.diploma) {
        const started = isStarted(p, 'vet');
        const can = canStart(p, 'vet', { level: g.level }).ok;
        out.push(h('div', { class: 'vs-diploma' }, t('vs_diploma'),
          h('p', { class: 'note' }, started ? t('vs_diplomaStarted') : t('vs_diplomaStart')),
          !started && can ? h('button', { class: 'primary', onClick: () => { g.clients?.startCareer('vet'); ui.renderPanel(); } }, t('vs_startCareer')) : null));
      }
      if (s.master) out.push(h('p', { class: 'vs-diploma' }, t('vs_master')));
      out.push(h('div', { class: 'vs-list' }, s.lessons.map((l, i) => h('button', {
        class: `vs-lesson ${l.done ? 'done' : ''} ${s.next === l.id ? 'next' : ''}`,
        disabled: !l.unlocked,
        title: l.unlocked ? '' : t('vs_lockedHelp'),
        onClick: () => openLesson(ui, l.id),
      },
      h('span', { class: 'vs-lesson-emoji' }, l.emoji),
      h('span', {}, h('b', {}, `${i + 1}. ${t(`vs_${l.id}_title`)}`, l.basic ? h('span', { class: 'vs-tag' }, t('vs_basicTag')) : null),
        h('small', {}, t(`vs_${l.id}_sub`))),
      h('span', { class: 'vs-lesson-side' }, l.done ? ['✅ ', h('span', { class: 'vs-stars' }, '★'.repeat(l.stars) + '☆'.repeat(3 - l.stars))]
        : l.unlocked ? '▶' : '🔒')))));
      return out;
    },
  });
  g.emit('panel', 'vetSchool');
}

// ------------------------------------------------------------------ une leçon

export function openLesson(ui, id) {
  const g = ui.game;
  const def = lessonDef(id);
  if (!def || !isUnlocked(g.profile, id)) return null;
  const index = LESSON_IDS.indexOf(id);
  const st = { step: 'learn', q: 0, mistakes: 0, answered: [], cleanup: [] };
  const ov = openOverlay(ui, {
    title: `${def.emoji} ${t(`vs_${id}_title`)}`,
    sub: `🎓 ${t('vs_lessonN', { n: index + 1, total: LESSONS.length })}`,
    cls: 'vs-box',
    onClose: () => {
      for (const fn of st.cleanup) fn();
      if (ui.vetLesson?.id === id) ui.vetLesson = null;
      if (ui.panel?.kind === 'vetSchool') ui.renderPanel();
    },
  });
  const steps = h('div', { class: 'vs-steps' });
  const body = h('div', { class: 'vs-lesson-body' });
  ov.body.append(steps, body);

  const clean = () => {
    for (const fn of st.cleanup) fn();
    st.cleanup = [];
  };
  const go = (step) => {
    clean();
    st.step = step;
    renderSteps();
    body.scrollTop = 0;
    if (step === 'learn') body.replaceChildren(...learn(id, ui, st), h('button', { class: 'primary big', onClick: () => go('try') }, t('vs_understood')));
    else if (step === 'try') body.replaceChildren(...exercise(ui, id, st, () => go('quiz')));
    else if (step === 'quiz') renderQuiz();
    else if (step === 'done') renderDone();
  };

  function renderSteps() {
    const order = ['learn', 'try', 'quiz'];
    const cur = order.indexOf(st.step);
    steps.replaceChildren(...order.map((k, i) => h('span', { class: i === cur ? 'on' : i < cur || st.step === 'done' ? 'done' : '' }, t(`vs_step_${k}`))));
  }

  function renderQuiz() {
    const q = def.quiz[st.q];
    const n = st.q + 1;
    const key = `vs_${id}_q${n}`;
    const state = { solved: false, wrong: new Set() };
    const box = h('div', { class: 'vs-answers' });
    const why = h('div', {});
    const draw = () => {
      box.replaceChildren(...Array.from({ length: q.answers }, (_, k) => {
        const right = state.solved && isRightAnswer(id, st.q, k);
        const wrong = state.wrong.has(k);
        return h('button', {
          class: `vs-answer ${right ? 'right' : ''} ${wrong ? 'wrong' : ''}`,
          disabled: state.solved || wrong,
          onClick: () => {
            if (isRightAnswer(id, st.q, k)) {
              state.solved = true;
              why.replaceChildren(h('p', { class: 'vx-msg good' }, t('vs_right')), h('p', { class: 'vs-why' }, `💡 ${t(`${key}_why`)}`),
                h('button', { class: 'primary big', onClick: () => { if (st.q + 1 < def.quiz.length) { st.q++; renderQuiz(); } else go('done'); } }, t('vs_continue')));
            } else {
              st.mistakes++;
              state.wrong.add(k);
              why.replaceChildren(h('p', { class: 'vx-msg warn' }, t('vs_tryAgain')));
            }
            draw();
          },
        }, t(`${key}_a${k + 1}`));
      }));
    };
    draw();
    body.replaceChildren(h('small', { class: 'note' }, t('vs_qN', { n, total: def.quiz.length })), h('p', { class: 'vs-q' }, t(key)), box, why);
    body.scrollTop = 0;
  }

  function renderDone() {
    const p = g.profile;
    const stars = quizStars(st.mistakes);
    const r = completeLesson(p, id, { stars, day: g.day });
    const lines = [];
    if (r.first) lines.push(h('li', {}, t(isStarted(p, 'vet') ? 'vs_xp' : 'vs_xpBank', { n: r.xp - (r.master ? MASTER_XP : 0) })));
    else lines.push(h('li', {}, t('vs_redo')));
    if (r.rankUp !== null && r.rankUp !== undefined) lines.push(h('li', {}, `🎖️ ${t('ca_rankUp', { rank: t(`ca_rank_${RANKS[r.rankUp]}`) })}`));
    const news = [];
    if (r.diploma) news.push(h('p', { class: 'vs-big-news' }, t('vs_newDiploma')));
    if (r.master) news.push(h('p', { class: 'vs-big-news' }, t('vs_newMaster', { n: MASTER_XP })));
    const next = LESSONS[index + 1];
    const canCareer = !isStarted(p, 'vet') && canStart(p, 'vet', { level: g.level }).ok && (r.diploma || BASIC_IDS.includes(id));
    g.emit('vetLesson', id);
    g.save?.();
    ui.renderStatus?.();
    body.replaceChildren(h('div', { class: 'vs-done' },
      h('div', { class: 'vs-done-emoji' }, '🎓'),
      h('h2', {}, `✅ ${t('vs_doneTitle')}`),
      h('div', { class: 'mg-stars', 'aria-label': `${stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off' }, '★'))),
      h('ul', {}, lines),
      ...news,
      h('div', { class: 'vs-actions' },
        canCareer && r.diploma ? h('button', { class: 'primary big', onClick: () => { g.clients?.startCareer('vet'); ov.close(); } }, t('vs_startCareer')) : null,
        next && isUnlocked(p, next.id) ? h('button', { class: `big ${canCareer && r.diploma ? '' : 'primary'}`, onClick: () => { ov.close(); openLesson(ui, next.id); } },
          `${next.emoji} ${t('vs_nextLesson')}`) : null,
        h('button', { class: 'big', onClick: () => ov.close() }, t('vs_backSchool')))));
  }

  go('learn');
  ui.vetLesson = { id, get step() { return st.step; }, go, close: ov.close, get q() { return st.q; } };
  return ui.vetLesson;
}

// ------------------------------------------------------------------ 📖 j'apprends

function points(id) {
  return h('ul', { class: 'vs-points' }, POINT_EMOJI[id].map((e, i) => h('li', {}, h('span', {}, e), h('span', {}, t(`vs_${id}_p${i + 1}`)))));
}

/** Une scène fixe : l'animal avec les zones montrées et nommées. */
function demoStage(st, a, zones) {
  const stage = new VetStage(a, makeCase(a), { demo: zones });
  st.cleanup.push(() => stage.destroy());
  return h('div', { class: 'vs-ill' }, stage.el);
}

function learn(id, ui, st) {
  const out = [];
  if (id === 'vitals') {
    out.push(h('table', { class: 'vs-table' },
      h('thead', {}, h('tr', {}, h('th', {}, t('vs_tbl_animal')), h('th', {}, '🌡️ °C'), h('th', {}, '❤️ /min'), h('th', {}, '🫁 /min'))),
      h('tbody', {}, ['horse', 'cow', 'sheep', 'goat', 'dog', 'cat', 'rabbit'].map((sp) => {
        const V = VITALS[sp];
        return h('tr', {}, h('td', {}, `${SPECIES[sp].emoji} ${L(SPECIES[sp].name)}`),
          h('td', {}, `${num(V.temp[0])}–${num(V.temp[1])}`), h('td', {}, `${V.heart[0]}–${V.heart[1]}`), h('td', {}, `${V.resp[0]}–${V.resp[1]}`));
      }))));
  } else if (id === 'stetho') out.push(demoStage(st, schoolAnimal('dog', 'labrador', 'Biscuit', 'm'), ['heart', 'lungs', 'gut']));
  else if (id === 'thermo') out.push(demoStage(st, schoolAnimal('goat', 'alpine', 'Noisette', 'f'), ['rump']));
  else if (id === 'look') out.push(demoStage(st, schoolAnimal('cat', 'europeen', 'Moustache', 'm'), ['eye', 'ear', 'nose', 'mouth']));
  else if (id === 'palpate') out.push(demoStage(st, schoolAnimal('dog', 'beagle', 'Caramel', 'f'), ['belly', 'legFront', 'legHind']));
  else if (id === 'hooves') out.push(h('div', { class: 'vs-ill' }, hoofCanvas()));
  else if (id === 'illness') {
    out.push(h('div', { class: 'vs-list' }, ILLNESS_IDS.map((ill) => h('div', { class: 'vs-lesson' },
      h('span', { class: 'vs-lesson-emoji' }, ILL_EMOJI[ill]), h('span', {}, h('b', {}, illName(ill)), h('small', {}, t(`vs_illcard_${ill}`)))))));
  } else if (id === 'care') {
    out.push(h('div', { class: 'vx-tx-grid' }, TREATMENTS.map((x) => h('div', { class: 'vx-tx vs-card' },
      h('span', { class: 'vx-tx-emoji' }, TREAT_EMOJI[x]), h('b', {}, t(`treat_${x}`)), h('small', {}, t(`vx_txd_${x}`))))));
  }
  out.push(points(id));
  return out;
}

/** Le sabot vu de dessous, avec le nom de chaque partie. */
function hoofCanvas() {
  const W = 320;
  const H = 300;
  const c = h('canvas', { class: 'vs-hoof', width: W * 2, height: H * 2 });
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(2, 2);
  g.fillStyle = '#fffdf5';
  g.fillRect(0, 0, W, H);
  const cx = 160;
  // Paroi (le bord dur)
  g.fillStyle = '#4a3426';
  g.beginPath();
  g.moveTo(cx - 92, 222);
  g.bezierCurveTo(cx - 118, 120, cx - 70, 34, cx, 32);
  g.bezierCurveTo(cx + 70, 34, cx + 118, 120, cx + 92, 222);
  g.quadraticCurveTo(cx + 74, 250, cx + 52, 236);
  g.lineTo(cx - 52, 236);
  g.quadraticCurveTo(cx - 74, 250, cx - 92, 222);
  g.fill();
  // Ligne blanche puis sole
  g.fillStyle = '#e9dcc0';
  g.beginPath();
  g.moveTo(cx - 78, 214);
  g.bezierCurveTo(cx - 100, 124, cx - 60, 48, cx, 46);
  g.bezierCurveTo(cx + 60, 48, cx + 100, 124, cx + 78, 214);
  g.lineTo(cx - 78, 214);
  g.fill();
  g.fillStyle = '#c8b28a';
  g.beginPath();
  g.moveTo(cx - 70, 208);
  g.bezierCurveTo(cx - 90, 126, cx - 54, 58, cx, 56);
  g.bezierCurveTo(cx + 54, 58, cx + 90, 126, cx + 70, 208);
  g.lineTo(cx - 70, 208);
  g.fill();
  // Fourchette (le V) et talons
  g.fillStyle = '#9b7f74';
  g.beginPath();
  g.moveTo(cx, 108);
  g.quadraticCurveTo(cx + 22, 170, cx + 46, 236);
  g.quadraticCurveTo(cx + 24, 246, cx + 8, 226);
  g.lineTo(cx, 200);
  g.lineTo(cx - 8, 226);
  g.quadraticCurveTo(cx - 24, 246, cx - 46, 236);
  g.quadraticCurveTo(cx - 22, 170, cx, 108);
  g.fill();
  g.fillStyle = '#7a6359';
  g.beginPath();
  g.moveTo(cx, 150);
  g.lineTo(cx + 5, 205);
  g.lineTo(cx - 5, 205);
  g.fill();
  // Étiquettes
  const tag = (text, x, y, tx, ty) => {
    g.strokeStyle = '#23302a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(tx, ty);
    g.stroke();
    g.fillStyle = '#23302a';
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
    g.font = '800 14px system-ui, sans-serif';
    const w = g.measureText(text).width + 12;
    const bx = Math.max(4, Math.min(W - w - 4, tx < cx ? tx - w : tx));
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.roundRect ? g.roundRect(bx, ty - 11, w, 22, 10) : g.rect(bx, ty - 11, w, 22);
    g.fill();
    g.fillStyle = '#23302a';
    g.textBaseline = 'middle';
    g.fillText(text, bx + 6, ty + 1);
  };
  tag(t('vs_hoof_toe'), cx, 38, cx + 40, 16);
  tag(t('vs_hoof_wall'), cx - 100, 140, cx - 118, 104);
  tag(t('vs_hoof_sole'), cx + 52, 120, cx + 108, 84);
  tag(t('vs_hoof_frog'), cx + 12, 180, cx + 96, 186);
  tag(t('vs_hoof_heels'), cx - 46, 236, cx - 92, 274);
  return c;
}

// ------------------------------------------------------------------ ✋ je m'entraîne

/** L'exercice de la leçon. done() passe aux questions. */
function exercise(ui, id, st, done) {
  const cont = () => h('button', { class: 'primary big', onClick: done }, t('vs_continue'));
  const def = lessonDef(id);
  const examEx = (a, tools, tasks, intro, after) => {
    const box = h('div', { class: 'vs-exam' });
    const view = createExamView(ui, {
      a,
      cs: makeCase(a),
      tools,
      tasks,
      observe: false,
      intro,
      onTasksDone: () => {
        view.setHint(t('vs_wellDone'), 'good');
        (after ?? (() => box.append(cont())))();
      },
    });
    st.cleanup.push(() => view.destroy());
    box.append(view.work, view.notes);
    return box;
  };

  switch (def.exercise) {
    case 'sortHeart': return [h('p', { class: 'vs-q' }, t('vs_ex_sort')), sortHeart(cont)];
    case 'stetho': {
      const a = schoolAnimal('dog', 'labrador', 'Biscuit', 'm');
      return [h('p', { class: 'vs-q' }, t('vs_ex_stetho', { name: a.name })), examEx(a, ['stetho'], ['lungs', 'gut', 'heart'])];
    }
    case 'thermo': {
      const a = schoolAnimal('goat', 'alpine', 'Noisette', 'f', 'cold');
      const wrap = h('div', {});
      const ex = examEx(a, ['thermo'], ['temp'], null, () => {
        wrap.append(h('p', { class: 'vs-q' }, t('vs_ex_thermo2')), thermoRounds(cont));
        setTimeout(() => wrap.lastElementChild?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
      });
      return [h('p', { class: 'vs-q' }, t('vs_ex_thermo1', { name: a.name })), ex, wrap];
    }
    case 'look': {
      const a = schoolAnimal('cat', 'europeen', 'Moustache', 'm', 'ear');
      return [h('p', { class: 'vs-q' }, t('vs_ex_look', { name: a.name })), examEx(a, ['light', 'mouth'], ['eyes', 'ears', 'nose', 'gums', 'crt'])];
    }
    case 'palpate': {
      const a = schoolAnimal('dog', 'beagle', 'Caramel', 'f', 'paw');
      return [h('p', { class: 'vs-q' }, ta('vs_ex_palpate', a)), examEx(a, ['palpate'], ['palpBelly', 'palpFront', 'palpHind'])];
    }
    case 'gait': {
      const order = shuffle(['paw', null]);
      const wrap = h('div', {});
      const round = (i) => {
        for (const fn of st.cleanup) fn();
        st.cleanup = [];
        const a = schoolAnimal('horse', 'selle_francais', i === 0 ? 'Tornade' : 'Éclair', i === 0 ? 'f' : 'm', order[i]);
        wrap.replaceChildren(h('p', { class: 'vs-q' }, ta('vs_ex_gait', a, { n: i + 1 })),
          examEx(a, ['walk'], ['gait'], null, () => wrap.append(i === 0
            ? h('button', { class: 'primary big', onClick: () => round(1) }, t('vs_continue'))
            : cont())));
      };
      round(0);
      return [wrap];
    }
    case 'match': return [h('p', { class: 'vs-q' }, t('vs_ex_match')), matchRounds(cont)];
    case 'treat': return [treatRounds(cont)];
    default: return [cont()];
  }
}

function sortHeart(cont) {
  const picked = [];
  const line = h('div', { class: 'vs-line' });
  const msg = h('div', {});
  const grid = h('div', { class: 'vs-sort' });
  const drawLine = () => line.replaceChildren(...(picked.length
    ? picked.flatMap((sp, i) => (i ? [h('span', { class: 'arrow' }, '➜'), SPECIES[sp].emoji] : [SPECIES[sp].emoji]))
    : [h('small', { class: 'note' }, '🐢 ❤️ … ❤️ 🚀')]));
  for (const sp of shuffle(SORT_ORDER)) {
    const b = h('button', {
      onClick: () => {
        if (sp === SORT_ORDER[picked.length]) {
          picked.push(sp);
          b.classList.add('picked');
          drawLine();
          msg.replaceChildren();
          if (picked.length === SORT_ORDER.length) {
            grid.hidden = true;
            msg.replaceChildren(h('p', { class: 'vx-msg good' }, t('vs_sort_done')), cont());
          }
        } else {
          b.classList.remove('wrong');
          void b.offsetWidth;
          b.classList.add('vs-answer', 'wrong');
          setTimeout(() => b.classList.remove('vs-answer', 'wrong'), 400);
          msg.replaceChildren(h('p', { class: 'vx-msg warn' }, t('vs_sort_wrong')));
        }
      },
    }, SPECIES[sp].emoji, h('small', {}, `≈ ${typicalHeartOf(sp)} ❤️`)); // valeur typique : l'ordre se lit sur les nombres
    grid.append(b);
  }
  drawLine();
  return h('div', { class: 'vs-card' }, line, grid, msg);
}

/** Plusieurs petites manches à la suite. make(i, next) dessine la manche i. */
function rounds(n, make, cont) {
  const box = h('div', { class: 'vs-card' });
  const step = (i) => {
    if (i >= n) {
      box.replaceChildren(h('p', { class: 'vx-msg good' }, t('vs_wellDone')), cont());
      return;
    }
    box.replaceChildren(h('small', { class: 'note' }, t('vs_round', { n: i + 1, total: n })), ...make(i, () => step(i + 1)));
  };
  step(0);
  return box;
}

function choiceRow(options, isRight, onRight, wrongText) {
  const msg = h('div', {});
  const row = h('div', { class: 'vs-answers' });
  for (const o of options) {
    const b = h('button', {
      class: 'vs-answer',
      onClick: () => {
        if (isRight(o.id)) {
          b.classList.add('right');
          row.querySelectorAll('button').forEach((x) => { x.disabled = true; });
          msg.replaceChildren(h('p', { class: 'vx-msg good' }, t('vs_right')));
          setTimeout(onRight, 700);
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          msg.replaceChildren(h('p', { class: 'vx-msg warn' }, wrongText()));
        }
      },
    }, o.label);
    row.append(b);
  }
  return [row, msg];
}

function thermoRounds(cont) {
  return rounds(THERMO_ROUNDS.length, (i, next) => {
    const r = THERMO_ROUNDS[i];
    const V = VITALS[r.sp];
    const truth = classify(r.t, V.temp);
    const fill = Math.max(8, Math.min(100, ((r.t - 35) / 7) * 100));
    const opts = [{ id: 'normal', label: t('vs_temp_normal') }, { id: 'high', label: t('vs_temp_fever') }, { id: 'low', label: t('vs_temp_cold') }];
    return [
      h('div', { class: 'vs-thermo' },
        h('div', { class: 'vs-thermo-bar' }, h('span', { style: { height: `${fill}%` } })),
        h('div', {}, h('div', { class: 'vs-card-big' }, `${SPECIES[r.sp].emoji} ${num(r.t)} °C`),
          h('small', { class: 'note' }, t('vs_temp_norm', { lo: num(V.temp[0]), hi: num(V.temp[1]) })))),
      ...choiceRow(opts, (id) => id === truth, next, () => t('vs_temp_wrong', { lo: num(V.temp[0]), hi: num(V.temp[1]) })),
    ];
  }, cont);
}

function matchRounds(cont) {
  const ills = shuffle(ILLNESS_IDS).slice(0, 4);
  return rounds(ills.length, (i, next) => {
    const ill = ills[i];
    const others = shuffle(ILLNESS_IDS.filter((x) => x !== ill)).slice(0, 2);
    const opts = shuffle([ill, ...others]).map((id) => ({ id, label: `${ILL_EMOJI[id]} ${illName(id)}` }));
    return [
      h('div', { class: 'vx-chips' }, MATCH_SIGNS[ill].map((s) => h('span', { class: 'vx-chip' }, `⚠️ ${t(`vx_sign_${s}`)}`))),
      ...choiceRow(opts, (id) => id === ill, next, () => t('vs_match_wrong')),
    ];
  }, cont);
}

function treatRounds(cont) {
  const ills = shuffle(ILLNESS_IDS).slice(0, 4);
  return rounds(ills.length + 1, (i, next) => {
    if (i === ills.length) {
      // La dose selon le poids : 1 ml pour 5 kg.
      const kg = 20;
      const opts = shuffle([2, 4, 20]).map((n) => ({ id: n, label: t('vs_dose_ml', { n }) }));
      return [h('p', { class: 'vs-q' }, `⚖️ ${t('vs_dose_q', { name: 'Biscuit', kg })}`), ...choiceRow(opts, (n) => n === kg / 5, next, () => t('vs_match_wrong'))];
    }
    const ill = ills[i];
    const opts = TREATMENTS.map((x) => ({ id: x, label: `${TREAT_EMOJI[x]} ${t(`treat_${x}`)} — ${t(`vx_txd_${x}`)}` }));
    return [h('p', { class: 'vs-q' }, `${ILL_EMOJI[ill]} ${t('vs_ex_treat', { ill: illName(ill) })}`),
      ...choiceRow(opts, (x) => x === treatmentFor(ill), next, () => t('vetWrong'))];
  }, cont);
}

// Interface du métier « Éducateur canin » : discussion avec le maître (bulles comme helperChat.js),
// carte du chien et de son problème, section de la fiche du chien (séances), carnet du métier,
// petites explications la première fois (👉 Montre-moi), résultats de séance et de livraison,
// badge de la liste des animaux et puces du bandeau d'état.
// La logique est dans src/sim/dogTrainer.js (inscrit dans le registre src/sim/careers.js),
// la 3D dans src/game/DogTrainer.js, les textes dans src/ui/dogTrainerTexts.js.

import { h, bar } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, addStat } from '../sim/profile.js';
import { animalCard } from './panels.js';
import { runMinigame } from './minigames.js';
import './minigames/dogTraining.js'; // enregistre les mini-jeux des séances
import { RANKS, rankProgress, careerState, isStarted } from '../sim/careers.js';
import {
  CAREER_ID, DOG_TRAINER_CAREER, PROBLEMS, COACHINGS, coachingsFor, canSession, readyForDelivery, isFixed, clientDogs,
  maxClients, dogTrainerOf, dogTrainerRank, dogTrainerReputation, careerBook, FIXED_BELOW, sessionPrice, isTrainingClient,
  daysLeft, neglectReason,
} from '../sim/dogTrainer.js';

const OWNER_EMOJI = { f: '👩', m: '👨' };

export const problemName = (id) => t(`dt_problem_${id}`);
export const rankName = (i) => t(`ca_rank_${RANKS[i]}`);

/** Lance le mini-jeu d'une séance (promesse : qualité 0 à 1, ou null si fermé). */
export const runSessionGame = (ui, a, gameId) => runMinigame(ui, a, gameId);

// ---------------------------------------------------------------- explications (première fois)

/** Petite carte d'explication avec « 👉 Montre-moi ». key : action du métier ; gameId : la séance. */
export function showDogTrainerTutorial(ui, key, next, gameId = null) {
  const d = dogTrainerOf(ui.game.profile);
  const how = gameId ? t(`dt_how_${gameId}`) : '';
  const go = () => {
    d.tutored[key] = true;
    ui.hideModal();
    next?.();
  };
  ui.showModal(h('div', { class: 'dt-tuto' },
    h('div', { class: 'dt-tuto-emoji' }, gameId ? (PROBLEMS[gameId] ?? COACHINGS[gameId])?.emoji ?? '🐕' : '🐕'),
    h('h3', {}, t(`dt_tuto_${key}_title`)),
    h('p', {}, t(`dt_tuto_${key}`)),
    how && how !== `dt_how_${gameId}` ? h('p', { class: 'dt-how' }, how) : null,
    h('div', { class: 'row end' }, h('button', { class: 'primary big dt-go', onClick: go }, `👉 ${t('dt_showMe')}`))));
}

// ---------------------------------------------------------------- discussion avec le maître

const logs = new Map();

export function openDogTrainerChat(ui, dt, v) {
  const g = ui.game;
  const p = g.profile;
  const req = v.req;
  const dog = req.dog;
  const key = `${req.ownerName}-${dog.id}-${v.returning ? 'back' : 'new'}`;
  if (!logs.has(key)) logs.set(key, []);
  const log = logs.get(key);
  const say = (who, text) => { log.push({ who, text }); while (log.length > 8) log.shift(); };
  const scrollDown = () => requestAnimationFrame(() => { const el = document.querySelector('#panel .hc-log'); if (el) el.scrollTop = el.scrollHeight; });
  const talk = (mine, reply) => { say('me', mine); say('them', reply); ui.renderPanel(); scrollDown(); };
  const returning = !!v.returning;
  const dg = { dog: dog.name, g: dog.sex };
  if (!log.length) {
    if (returning) say('them', t(isFixed(dog) ? 'dt_back_hello' : 'dt_back_hello_fail', dg));
    else {
      say('them', t('dt_hello', dg));
      say('them', t(`dt_ask_${req.main}`, dg));
      if (req.rescue) say('them', t('dt_ask_rescue', dg));
    }
  }

  const problems = returning ? dog.client.problems : req.problems;
  const dogCard = () => h('div', { class: 'dt-dogcard' },
    animalCard(dog),
    h('div', { class: 'chips' }, Object.entries(problems).map(([id, v2]) => h('span', { class: `chip ${v2 < FIXED_BELOW ? 'mood-happy' : 'mood-sad'}` }, `${PROBLEMS[id].emoji} ${problemName(id)} · ${Math.round(v2)} %`))),
    returning
      ? h('p', { class: 'note' }, t('dt_sessionsDone', { n: dog.client.sessionsDone, total: dog.client.sessionsNeeded }))
      : h('p', { class: 'note' }, `📅 ${t('dt_sessionsNeeded', { n: req.sessionsNeeded })}${isSandbox(p) ? '' : ` · ${t('dt_pricePer', { n: req.price })}`}`),
  );

  const actions = () => {
    if (returning) {
      return [
        h('button', { class: 'hc-btn primary dt-deliver', onClick: () => { ui.closePanel(); dt.deliver(); } }, h('span', {}, '🎬'), ` ${t('dt_demo')}`),
        h('button', { class: 'hc-btn', onClick: () => talk(t('dt_howWas'), t('dt_howWas_reply', { ...dg, n: dog.client.sessionsDone })) }, h('span', {}, '💬'), ` ${t('dt_howWas')}`),
      ];
    }
    const full = clientDogs(p).length >= maxClients(p);
    return [
      h('button', {
        class: `hc-btn primary dt-accept ${full ? 'off' : ''}`,
        onClick: () => {
          if (full) return ui.toast(t('dt_full', { n: maxClients(p) }));
          const r = dt.accept();
          if (!r.ok) return ui.toast(t('dt_full', { n: maxClients(p) }));
          say('me', t('dt_accept'));
          say('them', t('dt_accept_reply', dg));
          ui.renderPanel();
          setTimeout(() => { if (ui.panel?.kind === 'dogTrainerChat') { ui.closePanel(); ui.openAnimal(dog); } }, 1400);
        },
      }, h('span', {}, '✅'), ` ${t('dt_accept')}`),
      h('button', { class: 'hc-btn dt-refuse', onClick: () => { dt.refuse(); ui.closePanel(); } }, h('span', {}, '❌'), ` ${t('dt_refuse')}`),
      h('button', { class: 'hc-btn', onClick: () => talk(t('dt_askMore'), t(`dt_more_${req.main}`, dg)) }, h('span', {}, '❓'), ` ${t('dt_askMore')}`),
    ];
  };

  ui.openPanel({
    title: `💬 ${req.ownerName}`,
    kind: 'dogTrainerChat',
    render: () => [
      h('div', { class: 'hc-head' },
        h('span', { class: 'hc-avatar' }, OWNER_EMOJI[req.ownerSex] ?? '🧑'),
        h('div', { class: 'hc-id' }, h('b', {}, req.ownerName), h('small', {}, t('dt_ownerOf', { dog: dog.name })))),
      h('div', { class: 'hc-log' }, log.map((l) => h('div', { class: `hc-msg ${l.who}` }, l.text))),
      dogCard(),
      h('div', { class: 'hc-actions' }, v.accepted && !returning ? [] : actions()),
    ],
  });
  g.emit('panel', 'dogTrainerChat');
  scrollDown();
}

// ---------------------------------------------------------------- fiche de l'animal : séances

/** « Tire en laisse : 60 % → 30 % » avec une petite barre de progrès. */
function problemRow(id, start, now) {
  const fixed = now < FIXED_BELOW;
  return h('div', { class: `dt-prob ${fixed ? 'fixed' : ''}` },
    h('span', { class: 'dt-prob-name' }, `${PROBLEMS[id].emoji} ${problemName(id)}`),
    // Avant la première séance : juste le niveau ; ensuite, d'où il part et où il en est.
    h('b', {}, `${Math.round(start) === Math.round(now) ? '' : `${Math.round(start)} % → `}${Math.round(now)} %${fixed ? ' ✅' : ''}`),
    h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(100 - now)}%` } })));
}

/** Quand le maître revient : « 📅 Retour du maître : dans 3 jours ». */
const dueText = (a, day) => {
  const n = daysLeft(a, day);
  return n === 0 ? t('dt_dueToday') : t('dt_due', { n });
};

/** Section de la fiche d'un animal (src/ui/panels.js). Renvoie [] s'il n'y a rien à montrer. */
export function dogTrainerSection(ui, a) {
  const g = ui.game;
  const dt = g.dogTrainer;
  if (!dt || !g.profile) return [];
  if (a.client && !isTrainingClient(a)) return []; // pension, soins : pas d'éducation
  const p = g.profile;
  const client = isTrainingClient(a);
  if (!client && !isStarted(p, CAREER_ID)) return []; // ses animaux : une fois le métier commencé
  const rank = dogTrainerRank(p);
  const ids = client ? Object.keys(a.client.problems) : coachingsFor(a, 99);
  if (!ids.length) return [];
  const can = canSession(a, g.day);
  const out = [h('h3', {}, t('dt_sectionTitle'))];
  if (client) {
    const c = a.client;
    out.push(h('p', { class: 'note' }, `${OWNER_EMOJI[c.ownerSex] ?? '🧑'} ${t('dt_clientOf', { owner: c.ownerName })} · ${t('dt_sessionsDone', { n: c.sessionsDone, total: c.sessionsNeeded })}${isSandbox(p) ? '' : ` · 🪙 ${c.price}/${t('dt_session').toLowerCase()}`}`));
    out.push(h('div', { class: 'dt-probs' }, ids.map((id) => problemRow(id, c.start[id], c.problems[id]))));
    // Affamé, assoiffé, sale ou malade : on prévient avant que le maître revienne (il paierait moins).
    const neglect = neglectReason(a);
    if (neglect) out.push(h('p', { class: 'warn dt-care-warn' }, t(`dt_careWarn_${neglect}`, { name: a.name, g: a.sex, owner: c.ownerName })));
    if (readyForDelivery(a, g.day)) out.push(h('p', { class: isFixed(a) ? 'good' : 'warn' }, t(isFixed(a) ? 'dt_readyGood' : 'dt_readyFail', { name: a.name, g: a.sex, owner: c.ownerName })));
    else out.push(h('p', { class: 'note' }, dueText(a, g.day)));
  } else {
    out.push(h('p', { class: 'note' }, t('dt_ownHelp', { name: a.name, g: a.sex })));
  }
  if (!can.ok && can.reason !== 'done') out.push(h('p', { class: 'note' }, t(`dt_cant_${can.reason}`, { name: a.name, g: a.sex })));
  out.push(h('div', { class: 'grid dt-sessions' }, ids.map((id) => {
    const def = PROBLEMS[id] ?? COACHINGS[id];
    const locked = !client && COACHINGS[id] && rank < COACHINGS[id].rank;
    const done = client && a.client.problems[id] < FIXED_BELOW;
    return h('button', {
      class: `act dt-session ${done ? 'done' : ''} ${locked ? 'locked' : ''}`,
      'data-session': id,
      disabled: (!can.ok && !locked) || done,
      onClick: () => (locked ? ui.toast(t('dt_lockedRank', { rank: rankName(COACHINGS[id].rank) })) : dt.session(a, id)),
    }, h('span', {}, `${locked ? '🔒' : def.emoji} ${t(`dt_session_${id}`)}`), h('small', {}, locked ? rankName(COACHINGS[id].rank) : done ? '✅' : t('dt_session')));
  })));
  return out;
}

/** Petit badge de la liste des animaux : « 🐕 En éducation · Mme Dupont · 1/4 séances ». */
export function trainingBadge(a) {
  if (!isTrainingClient(a)) return null;
  const c = a.client;
  return h('span', { class: 'cl-badge training' }, t('dt_badge', { owner: c.ownerName, n: c.sessionsDone, total: c.sessionsNeeded }));
}

// ---------------------------------------------------------------- résultats

export function showSessionResult(ui, a, id, r) {
  const own = r.before === null;
  const stars = r.perfect ? 3 : (r.after !== null && r.after < r.before) || own ? 2 : 1;
  ui.showModal([
    h('div', { class: 'mg-end-card dt-result' },
      h('div', { class: 'mg-end-emoji' }, SPECIES[a.species].emoji),
      h('h2', {}, t(stars === 3 ? 'mg_bravo' : stars === 2 ? 'mg_wellDone' : 'dt_tryAgain')),
      h('div', { class: 'mg-stars', 'aria-label': `${stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off' }, '★'))),
      own
        ? h('p', {}, t('dt_ownProgress', { name: a.name, g: a.sex, what: t(`dt_session_${id}`) }))
        : h('div', { class: 'dt-probs' }, problemRow(id, r.before, r.after)),
      h('p', { class: 'note' }, `🎓 +${r.xp} ${t('dt_xp')}`),
      h('button', { class: 'primary big', onClick: () => ui.hideModal() }, 'OK')),
  ]);
}

export function showDelivery(ui, a, r, onClose) {
  const g = ui.game;
  const sandbox = isSandbox(g.profile);
  const c = a.client;
  let photo = false;
  const neglected = r.care && r.care !== 'good' && !!r.neglect;
  const close = () => { ui.hideModal(); onClose?.(); };
  const render = () => [
    h('div', { class: 'mg-end-card dt-result' },
      h('div', { class: 'mg-end-emoji' }, neglected ? '😟' : r.success ? '🏅' : '💛'),
      h('h2', {}, t(r.success ? 'dt_deliverTitle' : 'dt_deliverTitle_fail', { dog: a.name, g: a.sex })),
      h('div', { class: 'mg-stars', 'aria-label': `${r.stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= r.stars ? 'on' : 'off' }, '★'))),
      // Chien rendu mal soigné : le maître le dit (affamé, assoiffé, sale, malade) au lieu de « Incroyable ! ».
      h('p', { class: 'dt-quote' }, `${OWNER_EMOJI[c.ownerSex] ?? '🧑'} « ${t(neglected ? `dt_owner_neglect_${r.neglect}` : r.success ? (r.stars === 3 ? 'dt_owner_3' : 'dt_owner_2') : 'dt_owner_fail', { dog: a.name, g: a.sex })} »`),
      h('ul', { class: 'dt-pay' },
        sandbox ? null : h('li', {}, `🪙 ${t('dt_payment')} : ${r.pay}`),
        r.tip && !sandbox ? h('li', {}, `💝 ${t('dt_tip')} : +${r.tip}`) : null,
        h('li', { class: r.repDelta >= 0 ? 'good' : 'bad' }, `⭐ ${t('dt_reputation')} : ${r.repDelta > 0 ? '+' : ''}${r.repDelta}`),
        h('li', {}, `🎓 +${r.xp} ${t('dt_xp')}`),
        r.rankUp ? h('li', { class: 'good' }, t('dt_rankUp', { rank: rankName(r.rank) })) : null),
      neglected ? h('p', { class: 'note' }, t('dt_neglect_explain', { dog: a.name, g: a.sex }))
        : !r.success ? h('p', { class: 'note' }, t('dt_fail_explain', { dog: a.name, g: a.sex })) : null,
      h('div', { class: 'row end' },
        h('button', { class: photo ? 'done' : '', disabled: photo, onClick: () => { photo = true; addStat(g.profile, 'dtPhotos'); addStat(g.profile, 'actvPhotos'); ui.toast(t('dt_photoTaken', { dog: a.name })); ui.modal.replaceChildren(h('div', { class: 'modal-box' }, render())); } }, `📸 ${t('dt_photo')}`),
        h('button', { class: 'primary', onClick: close }, `👋 ${t('dt_bye')}`))),
  ];
  ui.showModal(render());
}

// ---------------------------------------------------------------- promenade en laisse (séance 3D)

/** Bandeau pendant la séance « tire en laisse » : jauge de traction, consigne, boutons. */
export function startLeashWalkOverlay(ui, a, st, on) {
  const fill = h('span', { class: 'dt-pull-fill' });
  const hint = h('p', { class: 'dt-walk-hint' });
  const count = h('b', {});
  const rewardBtn = h('button', { class: 'primary dt-reward', onClick: () => on.reward() }, `🍪 ${t('dt_mg_btn_treat')}`);
  const el = h('div', { id: 'dt-walk' },
    h('div', { class: 'dt-walk-head' }, h('span', {}, `🦮 ${t('dt_session_pull')} · ${a.name}`), count),
    h('div', { class: 'dt-pull' }, h('span', { class: 'dt-pull-track' }, fill)),
    hint,
    h('div', { class: 'row' }, rewardBtn, h('button', { onClick: () => on.stop() }, `✕ ${t('dt_stop')}`)));
  ui.root.append(el);
  let lastPhase = '';
  const render = () => {
    fill.style.width = `${Math.round(st.pull * 100)}%`;
    fill.dataset.level = st.pull > 0.3 ? 'high' : 'low';
    count.textContent = `${st.rewards} / ${st.need}`;
    const phase = st.phase;
    if (phase !== lastPhase) {
      lastPhase = phase;
      hint.textContent = t(`dt_walk_${phase}`, { name: a.name, g: a.sex });
      hint.dataset.kind = phase === 'reward' ? 'good' : phase === 'pulling' || phase === 'bad' ? 'warn' : '';
      rewardBtn.classList.toggle('glow', phase === 'reward');
    }
  };
  render();
  return { render, close: () => el.remove() };
}

// ---------------------------------------------------------------- carnet du métier

export function openDogTrainerPanel(ui) {
  const g = ui.game;
  const p = g.profile;
  const def = DOG_TRAINER_CAREER;
  const render = () => {
    const out = [];
    const started = isStarted(p, CAREER_ID);
    const unlocked = g.level >= def.level || started;
    const rank = dogTrainerRank(p);
    const pr = rankProgress(p, CAREER_ID);
    out.push(h('div', { class: 'hc-head' },
      h('span', { class: 'hc-avatar' }, def.emoji),
      h('div', { class: 'hc-id' },
        h('b', {}, `${t(`career_${CAREER_ID}`)}${started ? ` · ${rankName(rank)}` : ''}`),
        started ? h('small', {}, pr.to === null ? `${pr.xp} ${t('dt_xp')} · ${t('dt_maxRank')}` : `${pr.xp} / ${pr.to} ${t('dt_xp')} → ${rankName(rank + 1)}`) : h('small', {}, t(`careerd_${CAREER_ID}`)),
        started ? h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(pr.ratio * 100)}%` } })) : null)));
    if (!unlocked) {
      out.push(h('p', { class: 'warn' }, `🔒 ${t('dt_locked', { n: def.level })}`));
      return out;
    }
    if (!started) {
      out.push(h('p', { class: 'note' }, t(`ca_perk_apprentice_${CAREER_ID}`)),
        h('p', { class: 'note' }, t('dt_notStarted')),
        h('button', { class: 'primary big', onClick: () => { g.clients.startCareer(CAREER_ID); ui.renderPanel(); } }, `💼 ${t('ca_start')}`));
      return out;
    }
    const d = dogTrainerOf(p);
    out.push(h('div', { class: 'bars' }, bar(`⭐ ${t('dt_reputation')}`, dogTrainerReputation(p), 'big')));
    out.push(h('p', { class: 'note ca-perk' }, t(`ca_perk_${RANKS[rank]}_${CAREER_ID}`)));
    const money = isSandbox(p) ? '' : `🪙 ${t('dt_earned', { n: careerState(p).earned[CAREER_ID] ?? 0 })} · ${t('dt_pricePer', { n: sessionPrice(p) })} · `;
    out.push(h('p', { class: 'note' }, `${money}${t('dt_maxClients', { n: maxClients(p) })}`));
    out.push(h('p', { class: 'note' }, t('dt_visitHours')));

    // Carnet : les actions du métier (registre commun)
    out.push(h('h3', {}, `📒 ${t('dt_book')}`));
    out.push(h('ul', { class: 'ca-carnet dt-book' }, careerBook(p).map((act) => h('li', { class: `${act.done ? 'done' : ''} ${act.locked ? 'locked' : ''}` },
      h('span', { class: 'ca-check' }, act.done ? '✅' : act.locked ? '🔒' : '⬜'),
      h('span', { class: 'ca-step' }, `${act.emoji} ${t(`ca_${CAREER_ID}_${act.id}`)}`,
        act.locked ? h('small', {}, ` · ${t('ca_actionLocked', { rank: rankName(act.rank) })}`) : null),
      !act.done && !act.locked ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); g.dogTrainer.showMe(act.id); } }, `👉 ${t('ca_showMe')}`) : null))));

    // Chiens en éducation
    const clients = clientDogs(p);
    out.push(h('h3', {}, `🐶 ${t('dt_clients')} (${clients.length}/${maxClients(p)})`));
    if (!clients.length) out.push(h('p', { class: 'note' }, t('dt_noClients')));
    for (const a of clients) {
      const c = a.client;
      out.push(h('div', { class: 'card dt-client' },
        h('span', { class: 'card-emoji' }, '🐶'),
        h('div', { class: 'card-body' },
          h('b', {}, `${a.name} · ${c.ownerName}`),
          h('small', {}, `${Object.entries(c.problems).map(([id, v]) => `${PROBLEMS[id].emoji} ${problemName(id)} ${Math.round(v)} %`).join(' · ')} · ${t('dt_sessionsDone', { n: c.sessionsDone, total: c.sessionsNeeded })}`),
          readyForDelivery(a, g.day) ? h('small', { class: 'good' }, t('dt_waitOwner')) : h('small', {}, dueText(a, g.day)),
          neglectReason(a) ? h('small', { class: 'warn dt-care-warn' }, t(`dt_careWarn_${neglectReason(a)}`, { name: a.name, g: a.sex, owner: c.ownerName })) : null),
        h('button', { onClick: () => ui.openAnimal(a) }, `📋 ${t('more')}`)));
    }

    // Historique
    out.push(h('h3', {}, `📜 ${t('dt_history')}`));
    if (!d.history.length) out.push(h('p', { class: 'note' }, t('dt_noHistory')));
    else out.push(h('ul', { class: 'memorial dt-history' }, d.history.slice(0, 8).map((x) => h('li', {},
      `${x.success ? '🏅' : '💛'} ${x.name} (${x.owner}) · ${problemName(x.problem)} · ${'★'.repeat(x.stars)}${'☆'.repeat(3 - x.stars)}${isSandbox(p) ? '' : ` · 🪙 ${x.pay}`} · ${t('day', { n: x.day })}`))));
    return out;
  };
  ui.openPanel({ title: `${def.emoji} ${t(`career_${CAREER_ID}`)}`, kind: 'dogTrainer', live: true, render });
}

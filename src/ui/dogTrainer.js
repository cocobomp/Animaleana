// Interface du métier « Éducateur canin » : discussion avec le maître (bulles comme helperChat.js),
// carte du chien et de son problème, section de la fiche du chien (séances), carnet du métier,
// petites explications la première fois (👉 Montre-moi), résultats de séance et de livraison.

import { h, bar } from './dom.js';
import { t, L, getLang } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox, addStat } from '../sim/profile.js';
import { animalCard } from './panels.js';
import { runMinigame } from './minigames.js';
import './minigames/dogTraining.js'; // enregistre les mini-jeux des séances
import {
  DOG_TRAINER_CAREER, PROBLEMS, COACHINGS, coachingsFor, canSession, readyForDelivery, isFixed, clientDogs, maxClients,
  dogTrainerOf, dogTrainerRank, careerBook, FIXED_BELOW, sessionPrice,
} from '../sim/dogTrainer.js';
import { careerXp, rankProgress } from '../sim/careersRegistry.js';

const RANK_IDS = ['apprenti', 'confirme', 'expert'];
const OWNER_EMOJI = { f: '👩', m: '👨' };

export const problemName = (id) => t(`dt_problem_${id}`);
const rankName = (i) => t(`dt_rank_${RANK_IDS[i]}`);

/** Lance le mini-jeu d'une séance (promesse : qualité 0 à 1, ou null si fermé). */
export const runSessionGame = (ui, a, gameId) => runMinigame(ui, a, gameId);

// ---------------------------------------------------------------- explications (première fois)

/** Petite carte d'explication avec « 👉 Montre-moi ». key : action du métier ; gameId : la séance. */
export function showDogTrainerTutorial(ui, key, next, gameId = null) {
  const d = dogTrainerOf(ui.game.profile);
  const act = DOG_TRAINER_CAREER.actions.find((x) => x.id === key);
  const how = gameId ? t(`dt_how_${gameId}`) : '';
  const go = () => {
    d.tutored[key] = true;
    ui.hideModal();
    next?.();
  };
  ui.showModal(h('div', { class: 'dt-tuto' },
    h('div', { class: 'dt-tuto-emoji' }, gameId ? (PROBLEMS[gameId] ?? COACHINGS[gameId])?.emoji ?? '🐕' : '🐕'),
    h('h3', {}, t(`dt_tuto_${key}_title`)),
    h('p', {}, t(act?.tutorial ?? `dt_tuto_${key}`)),
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
  const key = `${req.ownerName}-${dog.id}`;
  if (!logs.has(key)) logs.set(key, []);
  const log = logs.get(key);
  const say = (who, text) => { log.push({ who, text }); while (log.length > 8) log.shift(); };
  const scrollDown = () => requestAnimationFrame(() => { const el = document.querySelector('.hc-log'); if (el) el.scrollTop = el.scrollHeight; });
  const talk = (mine, reply) => { say('me', mine); say('them', reply); ui.renderPanel(); scrollDown(); };
  const returning = !!v.returning;
  if (!log.length) {
    if (returning) say('them', t(isFixed(dog) ? 'dt_back_hello' : 'dt_back_hello_fail', { dog: dog.name, g: dog.sex }));
    else {
      say('them', t('dt_hello', { dog: dog.name, g: dog.sex }));
      say('them', t(`dt_ask_${req.main}`, { dog: dog.name, g: dog.sex }));
      if (req.rescue) say('them', t('dt_ask_rescue', { dog: dog.name, g: dog.sex }));
    }
  }

  const problems = returning ? dog.client.problems : req.problems;
  const dogCard = () => h('div', { class: 'dt-dogcard' },
    animalCard(dog),
    h('div', { class: 'chips' }, Object.entries(problems).map(([id, v2]) => h('span', { class: `chip ${v2 < FIXED_BELOW ? 'mood-happy' : 'mood-sad'}` }, `${PROBLEMS[id].emoji} ${problemName(id)} · ${Math.round(v2)} %`))),
    returning
      ? h('p', { class: 'note' }, t('dt_sessionsDone', { n: dog.client.sessionsDone, total: dog.client.sessionsNeeded }))
      : h('p', { class: 'note' }, `📅 ${t('dt_sessionsNeeded', { n: req.sessionsNeeded })} · ${t('dt_pricePer', { n: req.price })}`),
  );

  const actions = () => {
    if (returning) {
      return [
        h('button', { class: 'hc-btn primary dt-deliver', onClick: () => { ui.closePanel(); dt.deliver(); } }, h('span', {}, '🎬'), ` ${t('dt_demo')}`),
        h('button', { class: 'hc-btn', onClick: () => talk(t('dt_howWas'), t('dt_howWas_reply', { dog: dog.name, g: dog.sex, n: dog.client.sessionsDone })) }, h('span', {}, '💬'), ` ${t('dt_howWas')}`),
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
          say('them', t('dt_accept_reply', { dog: dog.name, g: dog.sex }));
          ui.renderPanel();
          setTimeout(() => { ui.closePanel(); ui.openAnimal(dog); }, 1400);
        },
      }, h('span', {}, '✅'), ` ${t('dt_accept')}`),
      h('button', { class: 'hc-btn dt-refuse', onClick: () => { dt.refuse(); ui.closePanel(); } }, h('span', {}, '❌'), ` ${t('dt_refuse')}`),
      h('button', { class: 'hc-btn', onClick: () => talk(t('dt_askMore'), t(`dt_more_${req.main}`, { dog: dog.name, g: dog.sex })) }, h('span', {}, '❓'), ` ${t('dt_askMore')}`),
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
      h('div', { class: 'hc-actions' }, actions()),
    ],
  });
  g.emit('panel', 'dogTrainerChat');
  scrollDown();
}

// ---------------------------------------------------------------- fiche de l'animal : séances

/** « Problème : tire en laisse 60 % → 30 % » */
function problemRow(id, start, now) {
  const fixed = now < FIXED_BELOW;
  return h('div', { class: `dt-prob ${fixed ? 'fixed' : ''}` },
    h('span', { class: 'dt-prob-name' }, `${PROBLEMS[id].emoji} ${problemName(id)}`),
    h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(100 - now)}%` } })),
    h('b', {}, `${Math.round(start)} % → ${Math.round(now)} %${fixed ? ' ✅' : ''}`));
}

/** Section de la fiche d'un animal (src/ui/panels.js). Renvoie [] s'il n'y a rien à montrer. */
export function dogTrainerSection(ui, a) {
  const g = ui.game;
  const dt = g.dogTrainer;
  if (!dt) return [];
  const p = g.profile;
  const rank = dogTrainerRank(p);
  const unlocked = g.level >= DOG_TRAINER_CAREER.level;
  if (!a.client && !unlocked) return [];
  const ids = a.client ? Object.keys(a.client.problems) : coachingsFor(a, 99);
  if (!ids.length) return [];
  const can = canSession(a, g.day);
  const out = [h('h3', {}, t('dt_sectionTitle'))];
  if (a.client) {
    const c = a.client;
    out.push(h('p', { class: 'note' }, `${OWNER_EMOJI[c.ownerSex] ?? '🧑'} ${t('dt_clientOf', { owner: c.ownerName })} · ${t('dt_sessionsDone', { n: c.sessionsDone, total: c.sessionsNeeded })} · 🪙 ${c.price}/${t('dt_session')}`));
    out.push(h('div', { class: 'dt-probs' }, ids.map((id) => problemRow(id, c.start[id], c.problems[id]))));
    if (readyForDelivery(a)) out.push(h('p', { class: isFixed(a) ? 'good' : 'warn' }, t(isFixed(a) ? 'dt_readyGood' : 'dt_readyFail', { name: a.name, g: a.sex, owner: c.ownerName })));
  } else {
    out.push(h('p', { class: 'note' }, t('dt_ownHelp', { name: a.name, g: a.sex })));
  }
  if (!can.ok) out.push(h('p', { class: 'note' }, t(`dt_cant_${can.reason}`, { name: a.name, g: a.sex })));
  out.push(h('div', { class: 'grid' }, ids.map((id) => {
    const def = PROBLEMS[id] ?? COACHINGS[id];
    const locked = !a.client && COACHINGS[id] && rank < COACHINGS[id].rank;
    const done = a.client && a.client.problems[id] < FIXED_BELOW;
    return h('button', {
      class: `act dt-session ${done ? 'done' : ''}`,
      disabled: !can.ok || done,
      onClick: () => (locked ? ui.toast(t('dt_lockedRank', { rank: rankName(COACHINGS[id].rank) })) : dt.session(a, id)),
    }, h('span', {}, `${locked ? '🔒' : def.emoji} ${t(`dt_session_${id}`)}`, h('small', {}, locked ? ` ${rankName(COACHINGS[id].rank)}` : done ? ` ✅` : ` ${t('dt_session')}`)));
  })));
  return out;
}

// ---------------------------------------------------------------- résultats

export function showSessionResult(ui, a, id, r) {
  const own = r.before === null;
  const stars = r.perfect ? 3 : (r.after !== null && r.after < r.before) || own ? 2 : 1;
  ui.showModal([
    h('div', { class: 'mg-end-card dt-result' },
      h('div', { class: 'mg-end-emoji' }, SPECIES[a.species].emoji),
      h('h2', {}, t(stars === 3 ? 'mg_bravo' : stars === 2 ? 'mg_wellDone' : 'dt_tryAgain')),
      h('div', { class: 'mg-stars' }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : 'off' }, '★'))),
      own
        ? h('p', {}, t('dt_ownProgress', { name: a.name, g: a.sex, what: t(`dt_session_${id}`) }))
        : h('p', {}, `${problemName(id)} : ${Math.round(r.before)} % → ${Math.round(r.after)} %${r.fixed ? ' ✅' : ''}`),
      h('p', { class: 'note' }, `+${r.xp} ${t('dt_xp')}`),
      h('button', { class: 'primary', onClick: () => ui.hideModal() }, 'OK')),
  ]);
}

export function showDelivery(ui, a, r, onClose) {
  const g = ui.game;
  const sandbox = isSandbox(g.profile);
  const c = a.client;
  let photo = false;
  const close = () => { ui.hideModal(); onClose?.(); };
  const render = () => [
    h('div', { class: 'mg-end-card dt-result' },
      h('div', { class: 'mg-end-emoji' }, r.success ? '🏅' : '💛'),
      h('h2', {}, t(r.success ? 'dt_deliverTitle' : 'dt_deliverTitle_fail', { dog: a.name })),
      h('div', { class: 'mg-stars', 'aria-label': `${r.stars}/3` }, [1, 2, 3].map((i) => h('span', { class: i <= r.stars ? 'on' : 'off' }, '★'))),
      h('p', { class: 'dt-quote' }, `${OWNER_EMOJI[c.ownerSex] ?? '🧑'} « ${t(r.success ? (r.stars === 3 ? 'dt_owner_3' : 'dt_owner_2') : 'dt_owner_fail', { dog: a.name, g: a.sex })} »`),
      h('ul', { class: 'dt-pay' },
        h('li', {}, `🪙 ${t('dt_payment')} : ${sandbox ? '—' : r.pay}`),
        r.tip ? h('li', {}, `💝 ${t('dt_tip')} : +${r.tip}`) : null,
        h('li', {}, `⭐ ${t('dt_reputation')} : ${r.repDelta > 0 ? '+' : ''}${r.repDelta}`),
        h('li', {}, `🎓 +${r.xp} ${t('dt_xp')}`),
        r.rankUp ? h('li', { class: 'good' }, t('dt_rankUp', { rank: rankName(r.rank) })) : null),
      !r.success ? h('p', { class: 'note' }, t('dt_fail_explain', { dog: a.name, g: a.sex })) : null,
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
    count.textContent = `${st.rewards} / 5`;
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
    const d = dogTrainerOf(p);
    const xp = careerXp(p, def.id);
    const rank = dogTrainerRank(p);
    const unlocked = g.level >= def.level;
    const next = def.ranks[rank + 1];
    const out = [];
    out.push(h('div', { class: 'hc-head' },
      h('span', { class: 'hc-avatar' }, def.emoji),
      h('div', { class: 'hc-id' },
        h('b', {}, `${L(def.name)} · ${rankName(rank)}`),
        h('small', {}, next ? `${xp} / ${next.xp} ${t('dt_xp')} → ${rankName(rank + 1)}` : `${xp} ${t('dt_xp')} · ${t('dt_maxRank')}`),
        h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(rankProgress(def, xp) * 100)}%` } })))));
    if (!unlocked) {
      out.push(h('p', { class: 'warn' }, `🔒 ${t('dt_locked', { n: def.level })}`));
      return out;
    }
    out.push(h('div', { class: 'bars' }, bar(`⭐ ${t('dt_reputation')}`, d.reputation, 'big')));
    out.push(h('p', { class: 'note' }, `🪙 ${t('dt_earned', { n: d.earned ?? 0 })} · ${t('dt_pricePer', { n: sessionPrice(p) })} · ${t('dt_maxClients', { n: maxClients(p) })}`));
    out.push(h('p', { class: 'note' }, t('dt_visitHours')));

    // Carnet : les actions du métier
    out.push(h('h3', {}, `📒 ${t('dt_book')}`));
    out.push(h('ul', { class: 'checklist dt-book' }, careerBook(p).map((act) => h('li', { class: act.done ? 'ok' : act.locked ? 'locked' : 'ko' },
      `${act.done ? '✅' : act.locked ? '🔒' : '⬜'} ${t(`dt_act_${act.id}`)}`,
      act.locked ? h('small', {}, ` · ${rankName(act.rank)}`) : null))));

    // Clients en cours
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
          readyForDelivery(a) ? h('small', { class: 'good' }, t('dt_waitOwner')) : null),
        h('button', { onClick: () => ui.openAnimal(a) }, `📋 ${t('more')}`)));
    }

    // Historique
    out.push(h('h3', {}, `📜 ${t('dt_history')}`));
    if (!d.history.length) out.push(h('p', { class: 'note' }, t('dt_noHistory')));
    else out.push(h('ul', { class: 'memorial dt-history' }, d.history.slice(0, 8).map((x) => h('li', {},
      `${x.success ? '🏅' : '💛'} ${x.name} (${x.owner}) · ${problemName(x.problem)} · ${'★'.repeat(x.stars)}${'☆'.repeat(3 - x.stars)} · 🪙 ${x.pay} · ${t('day', { n: x.day })}`))));
    void getLang();
    return out;
  };
  ui.openPanel({ title: `${def.emoji} ${L(def.name)}`, kind: 'dogTrainer', live: true, render });
}

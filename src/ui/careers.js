// 💼 Métiers : le panneau des métiers (verrouillé / disponible / en cours), le carnet d'actions à cocher
// avec « 👉 Montre-moi », et la proposition « Tu veux apprendre le métier de… ? ».
// La logique est dans src/sim/careers.js ; les clients (visiteurs) dans src/game/Clients.js.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { isSandbox } from '../sim/profile.js';
import { CAREERS, CAREER_IDS, RANKS, careerSummary, setActiveCareer, nextAction } from '../sim/careers.js';

const rankLabel = (rank) => t(`ca_rank_${RANKS[rank]}`);

/** Le panneau « Métiers ». */
export function openCareers(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `💼 ${t('careers')}`,
    live: true,
    kind: 'careers',
    render: () => {
      const p = g.profile;
      const out = [h('p', { class: 'note' }, t('careersHelp'))];
      for (const id of CAREER_IDS) out.push(careerCard(ui, careerSummary(p, id, { level: g.level })));
      out.push(h('p', { class: 'note' }, t('careersMore')));
      return out;
    },
  });
  g.emit('panel', 'careers');
}

function careerCard(ui, s) {
  const g = ui.game;
  const p = g.profile;
  const def = CAREERS[s.id];
  const head = h('div', { class: 'ca-head' },
    h('span', { class: 'ca-emoji' }, def.emoji),
    h('div', { class: 'ca-title' },
      h('b', {}, t(`career_${s.id}`)),
      h('small', {}, t(`careerd_${s.id}`))),
    s.state === 'locked' ? h('span', { class: 'lock' }, `🔒 ${t('level', { n: s.level })}`) : null,
    s.state === 'started' ? h('span', { class: `ca-rank r${s.rank}` }, `🎖️ ${rankLabel(s.rank)}`) : null);
  const body = [];
  if (s.state === 'available') {
    body.push(h('p', { class: 'note' }, t('ca_perk_apprentice_' + s.id)),
      h('button', { class: 'primary big', onClick: () => { g.clients.startCareer(s.id); ui.renderPanel(); } }, `💼 ${t('ca_start')}`));
  } else if (s.state === 'locked') {
    body.push(h('p', { class: 'note' }, t('ca_lockedHelp', { n: s.level })));
  } else {
    const pr = s.progress;
    body.push(h('div', { class: 'ca-xp' },
      h('span', {}, `✨ ${t('ca_xp')} ${pr.xp}`),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill good', style: { width: `${Math.round(pr.ratio * 100)}%` } })),
      h('small', {}, pr.to === null ? t('ca_maxRank') : t('ca_nextRank', { n: pr.to - pr.xp, rank: rankLabel(pr.rank + 1) }))));
    body.push(h('p', { class: 'note ca-perk' }, t(`ca_perk_${RANKS[s.rank]}_${s.id}`)));
    body.push(h('div', { class: 'ca-stats' },
      h('span', {}, `⭐ ${t('cl_rep')} ${Math.round(s.reputation)}`),
      isSandbox(p) ? null : h('span', {}, t('ca_earned', { n: s.earned }))));
    body.push(h('h4', {}, `📒 ${t('ca_carnet')}`));
    const next = nextAction(p, s.id);
    body.push(h('ul', { class: 'ca-carnet' }, s.carnet.map((a) => h('li', { class: `${a.done ? 'done' : ''} ${next?.id === a.id ? 'now' : ''}` },
      h('span', { class: 'ca-check' }, a.done ? '✅' : '⬜'),
      h('span', { class: 'ca-step' }, `${a.emoji} ${t(`ca_${s.id}_${a.id}`)}`),
      !a.done && next?.id === a.id ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); g.clients.showMe(s.id, a.id); } }, `👉 ${t('ca_showMe')}`) : null))));
    if (!s.active) body.push(h('button', { class: 'small', onClick: () => { setActiveCareer(p, s.id); ui.renderPanel(); ui.renderStatus(); } }, `📌 ${t('ca_follow')}`));
    else body.push(h('small', { class: 'ca-following' }, `📌 ${t('ca_following')}`));
  }
  return h('div', { class: `ca-card ${s.state} ${s.active ? 'active' : ''}` }, head, ...body);
}

/** « Tu veux apprendre le métier de vétérinaire ? » */
export function showCareerOffer(ui, id, { yes, later }) {
  const def = CAREERS[id];
  ui.showModal(h('div', { class: 'cl-modal ca-offer' },
    h('div', { class: 'ca-offer-emoji' }, def.emoji),
    h('h2', {}, t('ca_offer_title')),
    h('p', { class: 'cl-bubble owner' }, t(`ca_offer_${id}`)),
    h('p', { class: 'note' }, t(`ca_perk_apprentice_${id}`)),
    h('div', { class: 'cl-buttons' },
      h('button', { class: 'cl-btn yes', onClick: () => { ui.hideModal(); yes(); } }, `💼 ${t('ca_yes')}`),
      h('button', { class: 'cl-btn no', onClick: () => { ui.hideModal(); later?.(); } }, t('ca_later')))));
}

/** Puce du bandeau d'état : la prochaine action du carnet du métier suivi. */
export function careerChips(ui, chip) {
  const g = ui.game;
  const p = g.profile;
  const id = p.careers?.active;
  if (!id || !CAREERS[id]) return [];
  const next = nextAction(p, id);
  if (!next) return [];
  return [chip(`${CAREERS[id].emoji} ${next.emoji} ${t(`ca_${id}_${next.id}`)}`, `👉 ${t('ca_showMe')}`, () => g.clients.showMe(id, next.id))];
}

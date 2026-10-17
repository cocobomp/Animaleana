// Interface des clients : la demande du visiteur (bulles, fiche de l'animal, prix, Accepter / Refuser),
// l'écran de fin (étoiles, commentaire, paiement), l'onglet « Clients » du Journal et les badges
// des animaux confiés. La logique est dans src/sim/clients.js, la 3D dans src/game/Clients.js.

import { h, bar } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox } from '../sim/profile.js';
import { animalCard } from './panels.js';
import { speciesName } from './names.js';
import { clientState, clientAnimals, canAccept, daysLeft, dailyCareScore, maxClients } from '../sim/clients.js';
import { CAREERS, startedCareers, reputationOf, RANKS, rankOf } from '../sim/careers.js';
import { XP } from '../sim/progress.js';
import { clientDogs, isTrainingClient, daysLeft as trainingDaysLeft } from '../sim/dogTrainer.js'; // éducateur canin

/** Les chiens en éducation (métier éducateur canin), avec le carnet du métier. */
function trainingDogs(ui) {
  const g = ui.game;
  const p = g.profile;
  if (p.careers?.started?.dogTrainer === undefined) return [];
  const dogs = clientDogs(p).filter(isTrainingClient);
  return [
    h('h3', {}, `🐕 ${t('dt_clients')} (${dogs.length})`),
    h('div', { class: 'cards' }, dogs.map((a) => h('button', { class: 'card cl-card training', onClick: () => ui.openAnimal(a) },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' },
        h('b', {}, a.name),
        h('small', {}, `${t('cl_owner', { owner: a.client.ownerName })} · ${t('dt_sessionsDone', { n: a.client.sessionsDone, total: a.client.sessionsNeeded })}`),
        h('small', {}, trainingDaysLeft(a, g.day) === 0 ? t('dt_dueToday') : t('dt_due', { n: trainingDaysLeft(a, g.day) })))))),
    h('button', { class: 'small', onClick: () => ui.openDogTrainer() }, t('dt_cardBtn')),
  ];
}

export const OWNER_EMOJI = (sex) => (sex === 'f' ? '👩' : '👨');
const KIND_EMOJI = { pension: '🏡', vet: '🩺' };

/** Une bulle de dialogue, comme dans une discussion. */
export function bubble(text, who = 'owner') {
  return h('div', { class: `cl-bubble ${who}` }, text);
}

export function starsEl(n, small = false) {
  return h('div', { class: `cl-stars ${small ? 'small' : ''}`, 'aria-label': `${n}/5` }, [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= n ? 'on' : '' }, '★')));
}

/** La demande du visiteur. */
export function showRequest(ui, visit, { accept, refuse, later }) {
  const g = ui.game;
  const p = g.profile;
  const a = visit.animal;
  const sandbox = isSandbox(p);
  const career = visit.career;
  const helloKey = career === 'vet' ? (visit.illness === 'paw' ? 'cl_hello_vet_paw' : 'cl_hello_vet') : 'cl_hello_pension';
  const check = canAccept(p, visit);
  const kindLabel = `${KIND_EMOJI[career]} ${t(`cl_kind_${career}`)}`;
  ui.showModal(h('div', { class: 'cl-modal' },
    h('div', { class: 'cl-head' },
      h('span', { class: 'cl-face' }, OWNER_EMOJI(visit.owner.sex)),
      h('div', {}, h('b', {}, visit.owner.name), h('small', {}, kindLabel))),
    h('div', { class: 'cl-chat' },
      bubble(ta(helloKey, a, { days: visit.days })),
      bubble(ta(`cl_todo_${career}`, a, { owner: visit.owner.name }), 'hint')),
    h('div', { class: 'cl-animal' },
      h('div', { class: 'cl-animal-name' }, `${SPECIES[a.species].emoji} ${a.name}`, a.sick ? h('span', { class: 'chip mood-sick' }, `🤒 ${t(`ill_${a.sick}`)}`) : null),
      animalCard(a)),
    h('div', { class: 'cl-deal' },
      h('span', { class: 'cl-deal-item' }, `📅 ${t('cl_days', { n: visit.days })}`),
      h('span', { class: 'cl-deal-item price' }, sandbox ? `🏅 ${t('cl_pricePoints', { n: visit.price })}` : t('cl_price', { n: visit.price })),
      sandbox ? null : h('small', {}, t('cl_perDay', { n: visit.perDay }))),
    check.ok ? null : h('p', { class: 'warn' }, check.reason === 'full' ? t('cl_full', { n: check.n }) : t('cl_needCareer', { career: t(`career_${career}`) })),
    h('div', { class: 'cl-buttons' },
      h('button', { class: 'cl-btn yes', disabled: !check.ok, onClick: () => { ui.hideModal(); accept(); } }, `✅ ${t('cl_accept')}`),
      h('button', { class: 'cl-btn no', onClick: () => { ui.hideModal(); refuse(); } }, `❌ ${t('cl_refuse')}`)),
    h('button', { class: 'small cl-later', onClick: () => { ui.hideModal(); later?.(); } }, t('cl_later'))));
}

/** Le propriétaire revient : étoiles, commentaire, paiement, réputation, XP. */
export function showResult(ui, res, onClose) {
  const sandbox = isSandbox(ui.game.profile);
  const lines = [];
  if (res.upset) lines.push(h('li', { class: 'bad' }, `😕 ${t('cl_payNone')}`));
  else {
    lines.push(h('li', { class: 'good' }, sandbox ? `🏅 ${t('cl_payPoints', { n: res.money })}` : t('cl_pay', { n: res.money })));
    if (res.bonus && !sandbox) lines.push(h('li', { class: 'good' }, `🌟 ${t('cl_bonus5', { n: res.bonus })}`));
    if (res.tip && !sandbox) lines.push(h('li', {}, t('cl_tip', { n: res.tip })));
  }
  if (res.kind === 'vet' && res.cured) lines.push(h('li', {}, ta('cl_cured', res.animal)));
  if (res.late) lines.push(h('li', {}, t('cl_late', { n: res.late })));
  lines.push(h('li', { class: res.repDelta >= 0 ? '' : 'bad' }, res.repDelta >= 0 ? t('cl_repUp', { n: res.repDelta }) : t('cl_repDown', { n: -res.repDelta })));
  if (!res.upset) lines.push(h('li', {}, `✨ ${t('cl_xp', { n: XP.client })}`));
  lines.push(h('li', {}, `${CAREERS[res.kind].emoji} ${t('ca_xpGain', { n: res.careerXp, career: t(`career_${res.kind}`) })}`));
  if (res.rankUp !== null) lines.push(h('li', { class: 'good' }, `🎖️ ${t('ca_rankUp', { rank: t(`ca_rank_${RANKS[res.rankUp]}`) })}`));
  const hint = res.worst ? ta(`cl_hint_${res.worst}`, res.animal) : null;
  ui.showModal(h('div', { class: `cl-modal result ${res.upset ? 'upset' : ''}` },
    h('div', { class: 'cl-head' },
      h('span', { class: 'cl-face' }, res.upset ? '😠' : OWNER_EMOJI(res.ownerSex)),
      h('div', {}, h('b', {}, t('cl_resultTitle', { owner: res.ownerName })), h('small', {}, `${SPECIES[res.species].emoji} ${res.name}`))),
    starsEl(res.stars),
    h('div', { class: 'cl-chat' },
      bubble(ta(`cl_res_${res.stars}`, res.animal)),
      hint ? bubble(hint, 'hint') : null,
      res.upset ? bubble(t('cl_upsetHelp'), 'tip') : null),
    h('p', { class: 'note' }, t('cl_score', { n: res.score })),
    h('ul', { class: 'cl-lines' }, lines),
    h('button', { class: 'primary big', onClick: () => { ui.hideModal(); onClose?.(); } }, t('cl_ok'))));
}

/** Petit badge pour la liste des animaux (🏡 en pension · Mme Dupont · 2 jours restants). */
export function clientBadge(a, g) {
  if (!a.client || a.client.kind === 'training') return null; // (éducateur canin : voir src/ui/dogTrainer.js)
  const c = a.client;
  return h('span', { class: `cl-badge ${c.kind}` }, `${KIND_EMOJI[c.kind]} ${t(c.kind === 'vet' ? 'cl_badgeVet' : 'cl_badge')} · ${c.ownerName} · ${t('cl_daysLeft', { n: daysLeft(a, g.day) })}`);
}

/** Bloc dans la fiche de l'animal : propriétaire, jours restants, barre de soin. */
export function clientInfo(a, g) {
  if (!a.client || a.client.kind === 'training') return null;
  const c = a.client;
  const left = daysLeft(a, g.day);
  const when = g.day > c.until ? t('cl_overdue') : left === 0 ? t('cl_today') : t('cl_daysLeft', { n: left });
  return h('div', { class: `cl-info ${c.kind}` },
    h('b', {}, `${KIND_EMOJI[c.kind]} ${t(c.kind === 'vet' ? 'cl_badgeVet' : 'cl_badge')}`),
    h('span', {}, `${t('cl_owner', { owner: c.ownerName })} · 📅 ${when}`),
    c.kind === 'vet' && a.sick ? h('span', { class: 'warn' }, ta('cl_vetHint', a)) : null,
    h('div', { class: 'bars small' }, bar(`💛 ${t('cl_careScore')}`, dailyCareScore(a))));
}

/** Onglet « Clients » du Journal : réputation des métiers, clients en cours, visiteur, historique. */
export function clientsTab(ui) {
  const g = ui.game;
  const p = g.profile;
  const st = clientState(p);
  // Tous les métiers commencés (réputation) ; l'éducateur canin a ses propres clients (plus bas).
  const started = startedCareers(p).filter((id) => KIND_EMOJI[id] || CAREERS[id].ownClients);
  const out = [h('p', { class: 'note' }, t('cl_help'))];
  if (!started.length) {
    out.push(h('p', { class: 'note' }, t('cl_needAnyCareer')),
      h('button', { class: 'primary', onClick: () => ui.openCareers?.() }, `💼 ${t('careers')}`));
  }
  for (const id of started) {
    const rep = Math.round(reputationOf(p, id));
    out.push(h('div', { class: 'cl-rep' },
      h('span', {}, `${CAREERS[id].emoji} ${t(`career_${id}`)} · ${t(`ca_rank_${RANKS[rankOf(p, id)]}`)}`),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill good', style: { width: `${rep}%` } })),
      h('b', {}, `⭐ ${rep}`)));
  }
  const visitor = st.visitor;
  if (visitor && g.isHome && !visitor.auto) {
    out.push(h('div', { class: 'cl-visitor' },
      h('span', {}, t('cl_waiting', { owner: visitor.owner.name, name: visitor.animal.name })),
      h('button', { class: 'small primary', onClick: () => { ui.closePanel(); g.clients?.goToVisitor(); } }, t('cl_go'))));
  }
  out.push(...trainingDogs(ui)); // éducateur canin : chiens en éducation (src/ui/dogTrainer.js)
  const list = clientAnimals(p);
  out.push(h('h3', {}, `${t('cl_title')} (${list.length}/${maxClients(p)})`));
  if (!list.length) out.push(h('p', { class: 'note' }, t('cl_noneNow')));
  out.push(h('div', { class: 'cards' }, list.map((a) => {
    const c = a.client;
    const left = daysLeft(a, g.day);
    const score = dailyCareScore(a);
    return h('button', { class: `card cl-card ${c.kind}`, onClick: () => ui.openAnimal(a) },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' },
        h('b', {}, `${a.name} · ${KIND_EMOJI[c.kind]} ${t(`cl_kind_${c.kind}`)}`),
        h('small', {}, `${speciesName(a)} · ${t('cl_owner', { owner: c.ownerName })}`),
        h('small', {}, `📅 ${g.day > c.until ? t('cl_overdue') : left === 0 ? t('cl_today') : t('cl_daysLeft', { n: left })}${c.kind === 'vet' && a.sick ? ` · ${ta('cl_vetHint', a)}` : ''}`),
        h('span', { class: 'mini-track' }, h('span', { class: `mini-fill ${score >= 60 ? '' : 'low'}`, style: { width: `${score}%` } }))),
      h('span', { class: 'card-side' }, `💛 ${score}`));
  })));
  if (st.history.length) {
    out.push(h('h3', {}, t('cl_history')), h('ul', { class: 'cl-history' }, st.history.slice(0, 8).map((x) => h('li', {},
      h('span', {}, `${SPECIES[x.species]?.emoji ?? '🐾'} ${x.name} · ${x.ownerName}`),
      starsEl(x.stars, true)))));
  }
  return out;
}

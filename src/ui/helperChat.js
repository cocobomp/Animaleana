// Discuter avec une aide : bonjour, « ça va ? », nouvelles des animaux, consignes, pause, formation.
// La conversation s'affiche comme des bulles de messagerie.

import { h } from './dom.js';
import { t, L } from '../i18n.js';
import { pick } from '../sim/rng.js';
import { HELPERS } from '../sim/farm.js';
import { SPECIES } from '../sim/species.js';
import { spend, isSandbox } from '../sim/profile.js';
import {
  helperLevel, helperProgress, helperMood, helperNews, helperAnimals, dayPart, onBreak, startBreak, endBreak,
  trainHelper, canTrain, praiseHelper, setPriority, TRAIN_COST, MAX_HELPER_LEVEL,
} from '../sim/helpers.js';

// Petites phrases (au hasard pour que ce ne soit pas toujours pareil). f = l'aide est une femme.
const LINES = {
  hello: {
    morning: [
      ({ fr: 'Bonjour ! Belle matinée pour s\'occuper des animaux ☀️', en: 'Good morning! Lovely day to look after the animals ☀️' }),
      ({ fr: 'Salut ! J\'ai déjà préparé le foin.', en: 'Hi! I\'ve already got the hay ready.' }),
      ({ fr: 'Bonjour patron ! Bien dormi ?', en: 'Morning, boss! Sleep well?' }),
    ],
    afternoon: [
      ({ fr: 'Coucou ! Ça avance bien ici.', en: 'Hey! Things are going well here.' }),
      ({ fr: 'Salut ! Il fait bon cet après-midi.', en: 'Hi! Nice afternoon, isn\'t it?' }),
    ],
    evening: [
      ({ fr: 'Bonsoir ! On rentre bientôt les animaux ?', en: 'Good evening! Shall we bring the animals in soon?' }),
      ({ fr: 'Bonsoir ! Encore un peu de travail et au lit.', en: 'Evening! A bit more work and then bed.' }),
    ],
    night: [
      ({ fr: 'Chut… les animaux dorment 🌙', en: 'Shh… the animals are asleep 🌙' }),
      ({ fr: 'Tu ne dors pas ? Il est tard !', en: 'Not asleep yet? It\'s late!' }),
    ],
  },
  howAreYou: {
    great: [
      (f) => L({ fr: `Super bien ! J'adore ce travail 😄`, en: 'Really good! I love this job 😄' }),
      (f) => L({ fr: `En pleine forme, merci !`, en: 'Full of energy, thanks!' }),
    ],
    ok: [
      (f) => L({ fr: `Ça va, un peu ${f ? 'occupée' : 'occupé'} mais ça va.`, en: 'Fine, a bit busy but fine.' }),
      (f) => L({ fr: 'Pas mal ! Il y a du boulot aujourd\'hui.', en: 'Not bad! Lots to do today.' }),
    ],
    tired: [
      (f) => L({ fr: `Je suis ${f ? 'épuisée' : 'épuisé'}… une petite pause me ferait du bien 😮‍💨`, en: 'I\'m worn out… a short break would help 😮‍💨' }),
      (f) => L({ fr: `Bof, je suis ${f ? 'fatiguée' : 'fatigué'}. Je travaille moins bien comme ça.`, en: 'Meh, I\'m tired. I don\'t work as well like this.' }),
    ],
  },
};

const NEED_TEXT = {
  hunger: ({ fr: 'a faim', en: 'is hungry' }),
  thirst: ({ fr: 'a soif', en: 'is thirsty' }),
  hygiene: ({ fr: 'aurait besoin d\'un bon nettoyage', en: 'needs a good clean' }),
  affection: ({ fr: 'réclame des câlins', en: 'wants cuddles' }),
  exercise: ({ fr: 'a besoin de se dégourdir les pattes', en: 'needs to stretch their legs' }),
  energy: ({ fr: 'est très fatigué(e)', en: 'is very tired' }),
};

function newsLine(n) {
  switch (n.key) {
    case 'nobody': return L({ fr: 'Il n\'y a encore personne dont je m\'occupe ici.', en: 'There\'s nobody for me to look after here yet.' });
    case 'sick': return L({ fr: `⚠️ ${n.name} est ${n.sex === 'f' ? 'malade' : 'malade'} ! Il faudrait appeler le vétérinaire.`, en: `⚠️ ${n.name} is sick! We should call the vet.` });
    case 'need': return L({ fr: `${n.name} ${L(NEED_TEXT[n.need])}.`, en: `${n.name} ${L(NEED_TEXT[n.need])}.` }).replace('fatigué(e)', n.sex === 'f' ? 'fatiguée' : 'fatigué');
    case 'pregnant': return L({ fr: `${n.name} attend un bébé 🍼, je la surveille.`, en: `${n.name} is expecting a baby 🍼, I'm keeping an eye on her.` });
    default: return L({ fr: `Tout le monde va bien ! ${n.name} est ${n.sex === 'f' ? 'ma chouchoute' : 'mon chouchou'} 😊`, en: `Everyone's fine! ${n.name} is my favourite 😊` });
  }
}

// Conversation en cours (par aide), gardée tant que le jeu est ouvert.
const logs = new Map();

export function openHelperChat(ui, helper) {
  const g = ui.game;
  const p = g.profile;
  const def = HELPERS[helper.type];
  const f = helper.sex === 'f';
  if (!logs.has(helper.id)) logs.set(helper.id, []);
  const log = logs.get(helper.id);
  const job = t(`helper_${helper.type}`, { g: helper.sex });
  const state = { tab: 'chat' };

  const say = (who, text) => {
    log.push({ who, text });
    while (log.length > 8) log.shift();
  };
  // Toujours montrer le dernier message.
  const scrollDown = () => requestAnimationFrame(() => {
    const el = document.querySelector('.hc-log');
    if (el) el.scrollTop = el.scrollHeight;
  });
  const talk = (mine, reply) => {
    say('me', mine);
    say('them', reply);
    ui.renderPanel();
    scrollDown();
  };
  if (!log.length) say('them', L(pick(LINES.hello[dayPart(g.hour)])));

  const actions = () => {
    const pauseNow = onBreak(helper, p.clock);
    const train = canTrain(helper, g.day);
    const sandbox = isSandbox(p);
    return [
      { icon: '👋', label: t('hc_hello'), run: () => talk(t('hc_hello'), L(pick(LINES.hello[dayPart(g.hour)]))) },
      { icon: '🙂', label: t('hc_howAreYou'), run: () => talk(t('hc_howAreYou'), pick(LINES.howAreYou[helperMood(helper)])(f)) },
      { icon: '🐾', label: t('hc_news'), run: () => talk(t('hc_news'), helperNews(helper, g.animalsHere()).map(newsLine).join(' ')) },
      { icon: '👏', label: t('hc_praise'), run: () => {
        const r = praiseHelper(helper, g.day);
        talk(t('hc_praise'), r.ok
          ? L({ fr: 'Oh merci, ça me fait trop plaisir ! 🥰', en: 'Aw thanks, that means a lot! 🥰' })
          : L({ fr: 'Hihi, tu me l\'as déjà dit aujourd\'hui 😊', en: 'Hehe, you already told me today 😊' }));
      } },
      pauseNow
        ? { icon: '💪', label: t('hc_backToWork'), run: () => { endBreak(helper); talk(t('hc_backToWork'), L({ fr: 'C\'est reparti !', en: 'Back to it!' })); } }
        : { icon: '☕', label: t('hc_break'), run: () => { startBreak(helper, p.clock); talk(t('hc_break'), L({ fr: 'Merci ! Je reviens dans une heure ☕', en: 'Thanks! Back in an hour ☕' })); } },
      {
        icon: '🎓',
        label: sandbox ? t('hc_train') : `${t('hc_train')} · ${TRAIN_COST} 🪙`,
        off: !train.ok,
        why: train.ok ? '' : t(`hc_why_${train.reason}`, { g: helper.sex }),
        run: () => {
          if (!sandbox && !spend(p, TRAIN_COST)) return ui.toast(t('r_money'));
          const r = trainHelper(helper, g.day);
          g.helpers.get(helper.id)?.refreshTag();
          talk(t('hc_train'), r.levelUp
            ? L({ fr: `J'ai appris plein de choses ! Je passe niveau ${r.level} ⭐`, en: `I learned so much! I'm now level ${r.level} ⭐` })
            : L({ fr: 'Merci pour la formation, j\'ai appris de nouvelles astuces 📚', en: 'Thanks for the training, I learned new tricks 📚' }));
          ui.refresh?.();
        },
      },
    ];
  };

  const head = () => {
    const lv = helperLevel(helper);
    const m = helperMood(helper);
    return h('div', { class: 'hc-head' },
      h('span', { class: 'hc-avatar' }, def.emoji),
      h('div', { class: 'hc-id' },
        h('b', {}, `${helper.name} · ${job}`),
        h('small', {}, `⭐ ${t('level', { n: lv })}${lv < MAX_HELPER_LEVEL ? '' : ' (max)'} · ${{ great: '😄', ok: '🙂', tired: '😮‍💨' }[m]} ${t(`hc_mood_${m}`, { g: helper.sex })}${onBreak(helper, p.clock) ? ` · ☕ ${t('hc_onBreak')}` : ''}`),
        h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(helperProgress(helper) * 100)}%` } }))));
  };

  const chat = () => [
    h('div', { class: 'hc-log' }, log.map((l) => h('div', { class: `hc-msg ${l.who}` }, l.text))),
    h('div', { class: 'hc-actions' }, actions().map((a) => h('button', {
      class: `hc-btn ${a.off ? 'off' : ''}`,
      onClick: () => (a.off ? ui.toast(a.why) : a.run()),
    }, h('span', {}, a.icon), ` ${a.label}`))),
    h('p', { class: 'note' }, t('hc_levelHelp')),
  ];

  // Consignes : ce que l'aide fait, et qui passer en premier.
  const orders = () => {
    const out = [];
    if (def.actions) {
      out.push(h('h3', {}, t('hc_duties')));
      out.push(h('div', { class: 'checks' }, def.actions.map((act) => h('label', { class: 'check' }, h('input', {
        type: 'checkbox',
        checked: (helper.duties ?? def.actions).includes(act),
        onChange: (e) => {
          const cur = new Set(helper.duties ?? def.actions);
          if (e.target.checked) cur.add(act); else cur.delete(act);
          helper.duties = [...cur];
        },
      }), ` ${t(`act_${act}`)}`))));
    }
    const mine = helperAnimals(helper, g.animalsHere());
    if (def.species && mine.length) {
      out.push(h('h3', {}, t('hc_priority')));
      out.push(h('div', { class: 'hc-prio' },
        h('button', { class: !helper.priority ? 'on' : '', onClick: () => { setPriority(helper, null); say('them', L({ fr: 'D\'accord, je m\'occupe de tout le monde.', en: 'OK, I\'ll look after everyone.' })); ui.renderPanel(); } }, `🐾 ${t('hc_everyone')}`),
        ...mine.map((a) => h('button', {
          class: helper.priority === a.id ? 'on' : '',
          onClick: () => {
            setPriority(helper, a.id);
            say('them', L({ fr: `Compris, je m'occupe de ${a.name} en premier !`, en: `Got it, I'll look after ${a.name} first!` }));
            ui.renderPanel();
          },
        }, `${SPECIES[a.species].emoji} ${a.name}`))));
    }
    if (!out.length) out.push(h('p', { class: 'note' }, t(`helperd_${helper.type}`)));
    return out;
  };

  ui.openPanel({
    title: `💬 ${helper.name}`,
    kind: 'helper',
    render: () => [
      head(),
      h('div', { class: 'tabs' },
        h('button', { class: state.tab === 'chat' ? 'active' : '', onClick: () => { state.tab = 'chat'; ui.renderPanel(); } }, `💬 ${t('hc_tabChat')}`),
        h('button', { class: state.tab === 'orders' ? 'active' : '', onClick: () => { state.tab = 'orders'; ui.renderPanel(); } }, `📋 ${t('hc_tabOrders')}`)),
      ...(state.tab === 'chat' ? chat() : orders()),
    ],
  });
  scrollDown();
}

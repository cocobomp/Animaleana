// Jouer le vétérinaire : observer les symptômes, choisir ses examens, faire le diagnostic, soigner.
// Rien n'est imposé : l'enfant cherche lui-même ce qu'a l'animal.

import { h } from './dom.js';
import { t, ta, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { ILLNESSES } from '../sim/animal.js';
import { canAfford } from '../sim/profile.js';

// Température normale de chaque espèce (°C).
const NORMAL_TEMP = { horse: 37.8, dog: 38.6, cat: 38.6, rabbit: 39.0, sheep: 39.2, goat: 39.2, cow: 38.6 };

const EXAMS = [
  { id: 'look', icon: '👀', name: { fr: 'Observer', en: 'Observe' } },
  { id: 'temp', icon: '🌡️', name: { fr: 'Prendre la température', en: 'Take the temperature' } },
  { id: 'ears', icon: '👂', name: { fr: 'Regarder les oreilles', en: 'Check the ears' } },
  { id: 'lungs', icon: '🩺', name: { fr: 'Écouter cœur et poumons', en: 'Listen to heart and lungs' } },
  { id: 'eyes', icon: '👁️', name: { fr: 'Regarder yeux et nez', en: 'Check eyes and nose' } },
  { id: 'mouth', icon: '🦷', name: { fr: 'Regarder la bouche', en: 'Check the mouth' } },
  { id: 'belly', icon: '🤚', name: { fr: 'Palper le ventre', en: 'Feel the belly' } },
  { id: 'legs', icon: '🦵', name: { fr: 'Examiner les pattes', en: 'Check the legs' } },
  { id: 'coat', icon: '🔍', name: { fr: 'Examiner le pelage', en: 'Check the coat' } },
];

// Ce qu'on trouve pour chaque maladie (les autres examens sont normaux).
const FINDINGS = {
  ear: {
    look: { fr: 'Il secoue la tête et se gratte les oreilles.', en: 'They shake their head and scratch their ears.' },
    ears: { fr: '⚠️ L\'intérieur de l\'oreille est rouge et sale.', en: '⚠️ The inside of the ear is red and dirty.' },
  },
  paw: {
    look: { fr: 'Il boite et pose mal une patte.', en: 'They limp and avoid putting weight on a leg.' },
    legs: { fr: '⚠️ Une patte est gonflée et lui fait mal quand on la touche.', en: '⚠️ One leg is swollen and hurts when touched.' },
  },
  belly: {
    look: { fr: 'Il ne veut plus manger et reste couché.', en: 'They won\'t eat and keep lying down.' },
    belly: { fr: '⚠️ Le ventre est dur et douloureux.', en: '⚠️ The belly is hard and painful.' },
    mouth: { fr: '⚠️ La langue est un peu pâle.', en: '⚠️ The tongue is a little pale.' },
    fever: 0.9,
  },
  cold: {
    look: { fr: 'Il éternue souvent.', en: 'They sneeze a lot.' },
    eyes: { fr: '⚠️ Les yeux pleurent et le nez coule.', en: '⚠️ Watery eyes and a runny nose.' },
    lungs: { fr: '⚠️ La respiration siffle un peu.', en: '⚠️ The breathing wheezes a little.' },
    fever: 0.8,
  },
  fleas: {
    look: { fr: 'Il se gratte le dos sans arrêt.', en: 'They keep scratching their back.' },
    coat: { fr: '⚠️ Des petites puces noires sautent dans les poils !', en: '⚠️ Tiny black fleas are jumping in the fur!' },
  },
  flu: {
    look: { fr: 'Il est très fatigué et tout chaud.', en: 'They are very tired and hot.' },
    lungs: { fr: '⚠️ Il tousse, ça siffle dans les poumons.', en: '⚠️ They cough, the lungs wheeze.' },
    fever: 1.8,
  },
};

// Versions au féminin (la femelle « elle »).
const FEM = (txt) => txt.replace(/^(⚠️ )?Il /, '$1Elle ').replace(/^Il /, 'Elle ')
  .replace('tout chaud', 'toute chaude').replace('lui fait mal', 'lui fait mal');

const NORMAL = {
  look: { fr: 'Il a l\'air en forme.', en: 'They look fine.' },
  ears: { fr: 'Les oreilles sont propres et roses.', en: 'The ears are clean and pink.' },
  lungs: { fr: 'Le cœur bat bien, la respiration est calme.', en: 'Good heartbeat, calm breathing.' },
  eyes: { fr: 'Les yeux brillent, le nez est propre.', en: 'Bright eyes, clean nose.' },
  mouth: { fr: 'Les gencives sont roses, les dents sont belles.', en: 'Pink gums, nice teeth.' },
  belly: { fr: 'Le ventre est souple, ça ne fait pas mal.', en: 'The belly is soft, no pain.' },
  legs: { fr: 'Les pattes sont souples, ça ne fait pas mal.', en: 'The legs are supple, no pain.' },
  coat: { fr: 'Le pelage est propre et brillant.', en: 'The coat is clean and shiny.' },
};

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

const DIAGNOSES = ['healthy', 'ear', 'paw', 'belly', 'cold', 'fleas', 'flu'];
const TREATMENTS = ['drops', 'bandage', 'syrup', 'shampoo', 'injection'];
const TREAT_EMOJI = { drops: '💧', bandage: '🩹', syrup: '💊', shampoo: '🧴', injection: '💉' };

/** atClinic : true = à la clinique, false = le vétérinaire vient, 'self' = je soigne moi-même (trousse). */
export function openVet(ui, a, atClinic) {
  const g = ui.game;
  const self = atClinic === 'self';
  const cost = self ? 0 : g.vetCost(atClinic);
  if (!canAfford(g.profile, cost)) {
    ui.toast(t('r_money'));
    return;
  }
  const illness = a.sick;
  const normalTemp = NORMAL_TEMP[a.species] ?? 38.5;
  const temp = (normalTemp + (FINDINGS[illness]?.fever ?? 0) + (Math.random() - 0.5) * 0.2).toFixed(1);
  const st = { step: 'exam', done: [], notes: [], msg: '', finished: false };

  const text = (obj) => {
    const s = L(obj);
    return a.sex === 'f' ? FEM(s) : s;
  };
  const finding = (exam) => {
    if (exam === 'temp') {
      const fever = Number(temp) > normalTemp + 0.6;
      return `${fever ? '⚠️ ' : ''}${t('vetTempIs', { t: temp, n: normalTemp })} ${fever ? t('vetFever', { g: a.sex }) : t('vetNoFever')}`;
    }
    return text(FINDINGS[illness]?.[exam] ?? NORMAL[exam]);
  };

  const render = () => {
    const out = [h('p', { class: 'vet-who' }, `${SPECIES[a.species].emoji} ${a.name}`,
      h('small', {}, self ? ` — ${t('vetSelf')}` : !atClinic ? ` — ${t('vetHome', { n: cost })}` : ''))];

    if (st.finished) {
      out.push(h('div', { class: 'vet-done' }, '💚'),
        h('p', { class: 'big-text' }, ta(illness ? 'vetCured' : 'vetCheckupDone', a)),
        h('button', { class: 'primary big', onClick: () => ui.closePanel() }, t('close')));
      return out;
    }

    // Carnet : ce qu'on a trouvé
    out.push(h('div', { class: 'vet-notes' }, h('b', {}, `📒 ${t('vetNotebook')}`),
      st.notes.length
        ? h('ul', {}, st.notes.map((n) => h('li', { class: n.text.startsWith('⚠️') ? 'bad' : '' }, `${n.icon} ${n.text}`)))
        : h('p', { class: 'note' }, t('vetNotebookEmpty'))));

    if (st.step === 'exam') {
      out.push(h('h3', {}, t('vetChooseExam')),
        h('div', { class: 'grid' }, EXAMS.map((ex) => h('button', {
          class: `act ${st.done.includes(ex.id) ? 'done' : ''}`,
          onClick: () => {
            if (!st.done.includes(ex.id)) {
              st.done.push(ex.id);
              st.notes.push({ icon: ex.icon, text: finding(ex.id) });
            }
            ui.renderPanel();
          },
        }, `${ex.icon} ${L(ex.name)}`))),
        h('button', { class: 'primary big', disabled: st.done.length < 2, onClick: () => { st.step = 'diag'; st.msg = ''; ui.renderPanel(); } },
          st.done.length < 2 ? t('vetMoreExams') : `🧠 ${t('vetToDiagnosis')}`));
    } else if (st.step === 'diag') {
      out.push(h('h3', {}, t('vetWhatIsIt', { g: a.sex })),
        h('div', { class: 'grid' }, DIAGNOSES.map((d) => h('button', {
          class: 'act',
          onClick: () => {
            if ((d === 'healthy' && !illness) || d === illness) {
              st.step = d === 'healthy' ? 'checkup' : 'treat';
              st.msg = `✅ ${t('vetRightDiag')}`;
            } else {
              st.msg = t('vetNotSure');
            }
            ui.renderPanel();
          },
        }, d === 'healthy' ? `💚 ${t('vetHealthy')}` : `🤒 ${cap(t(`ill_${d}`))}`))),
        h('button', { class: 'small', onClick: () => { st.step = 'exam'; st.msg = ''; ui.renderPanel(); } }, `↩ ${t('vetBackExams')}`));
    } else if (st.step === 'treat') {
      out.push(h('h3', {}, t('vetWhichTreatment', { ill: t(`ill_${illness}`) })),
        h('div', { class: 'grid' }, TREATMENTS.map((x) => h('button', {
          class: 'act',
          onClick: () => {
            if (x !== ILLNESSES[illness].treatment) st.msg = t('vetWrong');
            else if (self && x === 'injection') st.msg = t('vetOnlyVet');
            else {
              finish();
              return;
            }
            ui.renderPanel();
          },
        }, `${TREAT_EMOJI[x]} ${t(`treat_${x}`)}`))));
    } else if (st.step === 'checkup') {
      out.push(h('h3', {}, t('vetAllGood')),
        h('button', { class: 'primary big', onClick: () => finish() }, self ? `💚 ${t('vetFinish')}` : `💉 ${t('vetVaccine')}`));
    }
    if (st.msg) out.push(h('p', { class: 'vet-msg' }, st.msg));
    return out;
  };

  function finish() {
    st.finished = true;
    if (self) g.selfCare(a);
    else g.vetDone(a, atClinic);
    ui.renderPanel();
  }

  ui.openPanel({ title: `🩺 ${self ? t('vetSelfTitle') : t('vetTitle')}`, render, animalId: a.id, kind: 'vet' });
}

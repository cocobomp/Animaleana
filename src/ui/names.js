// Noms d'espèce accordés au sexe et à l'âge (jument, chienne, agneau…).

import { getLang } from '../i18n.js';
import { lifeStage } from '../sim/animal.js';

const NAMES = {
  fr: {
    horse: { m: 'Cheval', f: 'Jument', bm: 'Poulain', bf: 'Pouliche' },
    dog: { m: 'Chien', f: 'Chienne', bm: 'Chiot', bf: 'Chiot' },
    cat: { m: 'Chat', f: 'Chatte', bm: 'Chaton', bf: 'Chatonne' },
    rabbit: { m: 'Lapin', f: 'Lapine', bm: 'Lapereau', bf: 'Lapereau' },
    sheep: { m: 'Bélier', f: 'Brebis', bm: 'Agneau', bf: 'Agnelle' },
    goat: { m: 'Bouc', f: 'Chèvre', bm: 'Chevreau', bf: 'Chevrette' },
    cow: { m: 'Taureau', f: 'Vache', bm: 'Veau', bf: 'Génisse' },
  },
  en: {
    horse: { m: 'Stallion', f: 'Mare', bm: 'Colt', bf: 'Filly' },
    dog: { m: 'Dog', f: 'Female dog', bm: 'Puppy', bf: 'Puppy' },
    cat: { m: 'Tomcat', f: 'Queen cat', bm: 'Kitten', bf: 'Kitten' },
    rabbit: { m: 'Buck rabbit', f: 'Doe rabbit', bm: 'Kit', bf: 'Kit' },
    sheep: { m: 'Ram', f: 'Ewe', bm: 'Lamb', bf: 'Lamb' },
    goat: { m: 'Billy goat', f: 'Nanny goat', bm: 'Kid', bf: 'Kid' },
    cow: { m: 'Bull', f: 'Cow', bm: 'Calf', bf: 'Heifer' },
  },
};

export function speciesName(a) {
  const n = NAMES[getLang()]?.[a.species] ?? NAMES.fr[a.species];
  const stage = lifeStage(a);
  const young = stage === 'baby' || stage === 'young';
  return n[(young ? 'b' : '') + (a.sex === 'f' ? 'f' : 'm')];
}

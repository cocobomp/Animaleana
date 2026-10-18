// Noms d'espèce accordés au sexe et à l'âge (jument, chienne, agneau…).

import { getLang, L } from '../i18n.js';
import { lifeStage } from '../sim/animal.js';
import { SPECIES } from '../sim/species.js';

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

/**
 * Nom d'une robe (couleur d'une race, src/sim/species.js) accordé au sexe : « Blanche » pour une chèvre,
 * « Blanc » pour un bouc (forme masculine c.m, en français seulement).
 */
export function coatLabel(color, sex) {
  if (!color) return '';
  return sex === 'm' && color.m && getLang() === 'fr' ? color.m : L(color.name);
}

/** Robe d'un animal, accordée à son sexe (« Bouc · Saanen · Blanc »). */
export function coatName(a) {
  const name = a.look?.colorName;
  if (!name) return '';
  if (a.sex !== 'm' || getLang() !== 'fr') return L(name);
  // La robe de sa race, sinon celle d'une autre race de l'espèce (croisé : race « mix »).
  const breeds = SPECIES[a.species]?.breeds ?? [];
  const own = breeds.find((b) => b.id === a.breed);
  const color = [own, ...breeds].flatMap((b) => b?.colors ?? []).find((c) => c.name.fr === name.fr);
  return color?.m ?? L(name);
}

// Noms d'espèce accordés au sexe et à l'âge (jument, chienne, agneau…).

import { getLang, L } from '../i18n.js';
import { lifeStage } from '../sim/animal.js';
import { SPECIES } from '../sim/species.js';
import { rankNewSpecies } from '../sim/careers.js';

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

// Noms d'espèce dans une phrase : « un chien » (un seul, avec l'article) ou « chiens » (pluriel).
const IN_TEXT = {
  fr: {
    horse: ['un cheval', 'chevaux'], dog: ['un chien', 'chiens'], cat: ['un chat', 'chats'], rabbit: ['un lapin', 'lapins'],
    sheep: ['un mouton', 'moutons'], goat: ['une chèvre', 'chèvres'], cow: ['une vache', 'vaches'],
  },
  en: {
    horse: ['a horse', 'horses'], dog: ['a dog', 'dogs'], cat: ['a cat', 'cats'], rabbit: ['a rabbit', 'rabbits'],
    sheep: ['a sheep', 'sheep'], goat: ['a goat', 'goats'], cow: ['a cow', 'cows'],
  },
};
const JOIN = { fr: { and: ' et ', or: ' ou ' }, en: { and: ' and ', or: ' or ' } };

/**
 * Liste d'espèces lisible dans une phrase : « chiens, chats et lapins », « un chien ou un chat ».
 * one : au singulier avec l'article ; or : « ou » au lieu de « et ». Liste vide : ''.
 * Sert aux textes qui suivent les espèces proposées (OFFERED_SPECIES, src/sim/species.js).
 */
export function speciesList(ids, { one = false, or = false } = {}) {
  const lang = IN_TEXT[getLang()] ? getLang() : 'fr';
  const words = ids.map((sid) => IN_TEXT[lang][sid]?.[one ? 0 : 1]).filter(Boolean);
  if (words.length <= 1) return words[0] ?? '';
  const last = words.pop();
  return `${words.join(', ')}${JOIN[lang][or ? 'or' : 'and']}${last}`;
}

/**
 * Paramètres des textes de rang (ca_perk_*, grm_rankDesc_*) : les animaux que le rang apporte, seulement les
 * espèces proposées (rankNewSpecies, src/sim/careers.js). { animals: 'chiens, ', list: 'chiens', List: 'Chiens' } ;
 * vides si le rang n'apporte aucune espèce proposée.
 */
export function perkParams(id, rank) {
  const list = speciesList(rankNewSpecies(id, rank));
  return { animals: list ? `${list}, ` : '', list, List: list.charAt(0).toUpperCase() + list.slice(1) };
}

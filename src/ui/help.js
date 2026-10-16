// ❓ Aide : des fiches « Comment faire ? » avec les étapes et l'endroit où aller,
// une recherche (« acheter une laisse ») et un bouton « Montre-moi » qui guide l'enfant.

import { h } from './dom.js';
import { t, L, getLang } from '../i18n.js';

// where : bâtiment ('refuge', 'petshop', 'stable', 'pen', 'paddock', 'kennel', 'hutch', 'vet', 'house', 'jobs')
//         ou bouton de l'écran ('hud:farm', 'hud:travel', 'hud:journal', 'hud:animals', 'hud:time')
const TOPICS = [
  { id: 'adopt', icon: '🐾', where: 'refuge',
    title: { fr: 'Recueillir un animal (gratuit)', en: 'Adopt an animal (free)' },
    keys: 'adopter recueillir refuge gratuit animal chien chat adopt shelter free',
    steps: { fr: ['Va au refuge (le bâtiment vert).', 'Touche « Adopter un animal ».', 'Choisis un animal et donne-lui un nom.'], en: ['Go to the shelter (the green building).', 'Tap "Adopt an animal".', 'Choose an animal and give it a name.'] } },
  { id: 'buy', icon: '🛒', where: 'petshop',
    title: { fr: 'Acheter un animal de la race de ton choix', en: 'Buy an animal of the breed you want' },
    keys: 'acheter animalerie race couleur buy pet shop breed colour',
    steps: { fr: ['Va à l\'animalerie (toit rouge, près de la maison).', 'Choisis l\'espèce, la race, la couleur, le sexe et l\'âge.', 'Appuie sur « Acheter » et choisis son nom.'], en: ['Go to the pet shop (red roof, near the house).', 'Choose species, breed, coat, sex and age.', 'Tap "Buy" and choose a name.'] } },
  { id: 'feed', icon: '🍖', where: null,
    title: { fr: 'Nourrir et donner à boire', en: 'Feed and give water' },
    keys: 'nourrir manger faim boire soif eau croquettes foin feed hungry water thirsty',
    steps: { fr: ['Touche ton animal (ou son nom).', 'Choisis « Nourrir » ou « Donner à boire » et fais le petit jeu.', 'Plus tard : installe une mangeoire automatique dans 🚜 Ferme.'], en: ['Tap your animal (or its name).', 'Choose "Feed" or "Give water" and play the mini-game.', 'Later: install an automatic feeder in 🚜 Farm.'] } },
  { id: 'leash', icon: '🦮', where: 'stable',
    title: { fr: 'Acheter une laisse et promener son chien', en: 'Buy a leash and walk your dog' },
    keys: 'laisse collier promener promenade chien acheter leash collar walk dog',
    steps: { fr: ['Va à l\'écurie et ouvre la « Sellerie ».', 'Achète un collier et une laisse.', 'Touche ton chien → « Plus… » → Équipement → Mettre.', 'Touche ton chien → « Promener en laisse ».'], en: ['Go to the stable and open the "Tack room".', 'Buy a collar and a leash.', 'Tap your dog → "More…" → Equipment → Put on.', 'Tap your dog → "Walk on a leash".'] } },
  { id: 'ride', icon: '🏇', where: 'paddock',
    title: { fr: 'Monter à cheval', en: 'Ride a horse' },
    keys: 'monter cheval équitation selle filet licol cru galoper ride horse saddle bridle gallop',
    steps: { fr: ['Ton cheval doit porter un licol ou un filet (fiche → Équipement).', 'Touche le cheval → « Monter » (ou « Monter à cru »).', 'Avance avec le joystick, Maj ou 🏃 pour galoper.', 'Touche « Descendre » pour mettre pied à terre.'], en: ['Your horse needs a halter or bridle (card → Equipment).', 'Tap the horse → "Ride" (or "Ride bareback").', 'Move with the joystick, Shift or 🏃 to gallop.', 'Tap "Get off" to dismount.'] } },
  { id: 'vet', icon: '🩺', where: 'vet',
    title: { fr: 'Soigner un animal malade', en: 'Treat a sick animal' },
    keys: 'malade soigner vétérinaire santé blessé sick vet health hurt',
    steps: { fr: ['Un animal malade a 🤒 au-dessus de sa tête.', 'Va à la clinique vétérinaire (croix verte).', 'Choisis l\'animal et fais l\'examen, la température et le soin.'], en: ['A sick animal has 🤒 above its head.', 'Go to the vet clinic (green cross).', 'Choose the animal and do the exam, temperature and treatment.'] } },
  { id: 'clean', icon: '🧹', where: 'stable',
    title: { fr: 'Ramasser les crottins et nettoyer', en: 'Pick up droppings and clean' },
    keys: 'crottin caca nettoyer propre curer box litière paille clean poop droppings stall litter',
    steps: { fr: ['Touche un crottin pour le ramasser.', 'À l\'écurie : « Curer les box » ; à la bergerie : « Ramasser les crottins ».', 'Pour les chats et lapins : « Changer la litière » / « Nettoyer le clapier ».'], en: ['Tap a dropping to pick it up.', 'At the stable: "Muck out"; at the sheepfold: "Pick up droppings".', 'For cats and rabbits: "Change the litter" / "Clean the hutch".'] } },
  { id: 'tricks', icon: '🎓', where: null,
    title: { fr: 'Apprendre des tours et entraîner', en: 'Teach tricks and train' },
    keys: 'tour dresser dressage entraîner assis patte au pied obéissance trick train sit paw heel',
    steps: { fr: ['D\'abord, crée un lien : joue, caresse et brosse ton animal.', 'Touche-le → « Plus… » → Tours ou Entraînement.', 'Répète plusieurs fois : il progresse petit à petit.'], en: ['First build a bond: play, pet and brush your animal.', 'Tap it → "More…" → Tricks or Training.', 'Repeat several times: it improves little by little.'] } },
  { id: 'babies', icon: '🍼', where: null,
    title: { fr: 'Avoir des bébés', en: 'Have babies' },
    keys: 'bébé bébés naissance portée poulain chiot reproduction baby babies birth foal puppy',
    steps: { fr: ['Il faut un mâle et une femelle adultes de la même espèce.', 'Touche l\'un d\'eux → « Plus… » → Avoir des bébés.', 'Remplis toutes les conditions ✅ (santé, bonheur, vétérinaire…).', 'Après quelques jours, les bébés naissent !'], en: ['You need an adult male and female of the same species.', 'Tap one → "More…" → Have babies.', 'Fulfil every condition ✅ (health, happiness, vet…).', 'After a few days, the babies are born!'] } },
  { id: 'helpers', icon: '🧑‍🌾', where: 'hud:farm',
    title: { fr: 'Embaucher une aide', en: 'Hire a helper' },
    keys: 'aide employé embaucher palefrenier berger petsitter helper hire groom shepherd',
    steps: { fr: ['Ouvre 🚜 Ferme → Aides.', 'Embauche une aide (débloquée avec les niveaux).', 'Touche-la pour lui parler et lui donner ses tâches.'], en: ['Open 🚜 Farm → Helpers.', 'Hire a helper (unlocked with levels).', 'Tap them to talk and give them tasks.'] } },
  { id: 'auto', icon: '🥣', where: 'hud:farm',
    title: { fr: 'Mangeoires et abreuvoirs automatiques', en: 'Automatic feeders and troughs' },
    keys: 'automatique mangeoire abreuvoir distributeur fontaine litière automatic feeder trough',
    steps: { fr: ['Ouvre 🚜 Ferme → Équipements.', 'Installe un équipement (débloqué avec les niveaux).', 'Les animaux y vont tout seuls quand ils en ont besoin.'], en: ['Open 🚜 Farm → Equipment.', 'Install equipment (unlocked with levels).', 'Animals use it by themselves when they need it.'] } },
  { id: 'grow', icon: '🏗️', where: 'hud:hud_build',
    title: { fr: 'Agrandir le paddock, la bergerie ou un enclos', en: 'Make the paddock, the sheepfold or an enclosure bigger' },
    keys: 'agrandir grandir réduire taille paddock bergerie enclos clapier écurie box construire construction grille poignée bigger grow resize size enclosure sheepfold stable stalls build',
    steps: { fr: ['Appuie sur 🏗️ Construire (en haut de l\'écran).', 'Touche le paddock (ou un autre enclos) : des ronds blancs apparaissent.', 'Tire un rond pour agrandir ou réduire, au mètre près : la taille et le prix s\'affichent.', 'Touche ✅ Valider. Pour l\'écurie : touche-la puis « +4 box ».'], en: ['Tap 🏗️ Build (top of the screen).', 'Tap the paddock (or another enclosure): white dots appear.', 'Drag a dot to make it bigger or smaller, metre by metre: the size and price show up.', 'Tap ✅ Confirm. For the stable: tap it, then "+4 stalls".'] } },
  { id: 'herd', icon: '🐑', where: 'pen',
    title: { fr: 'Conduire le troupeau', en: 'Drive the herd' },
    keys: 'troupeau mouton chèvre vache bergerie pré chien de troupeau herd sheep goat cow field',
    steps: { fr: ['Va à la bergerie.', 'Choisis « Emmener au pré » ou « Rentrer le troupeau ».', 'Avec un chien de troupeau ou un berger, c\'est automatique ; sinon fais-le toi-même (à cheval c\'est plus facile).'], en: ['Go to the sheepfold.', 'Choose "Take to the field" or "Bring the herd in".', 'With a herding dog or a shepherd it\'s automatic; otherwise do it yourself (easier on horseback).'] } },
  { id: 'travel', icon: '🧭', where: 'hud:travel',
    title: { fr: 'Voyager', en: 'Travel' },
    keys: 'voyage voyager pays avion bateau van travel country plane boat',
    steps: { fr: ['Appuie sur 🧭 Voyager.', 'Choisis la destination, qui vient avec toi et le transport.', 'Les longs voyages fatiguent les animaux : pense à les laisser au voisin.'], en: ['Tap 🧭 Travel.', 'Choose the destination, who comes and the transport.', 'Long trips tire animals: consider leaving them with the neighbour.'] } },
  { id: 'time', icon: '⏩', where: 'hud:time',
    title: { fr: 'Gérer le temps', en: 'Manage time' },
    keys: 'temps pause vite avancer nuit dormir time pause fast skip night sleep',
    steps: { fr: ['Sous l\'horloge : ⏸ pause, ▶ vitesse normale, ⏩ avance rapide.', '🤖 Auto : ton personnage fait tout seul les tâches simples.', 'Pour passer la nuit : va dormir dans la maison (à partir de 19 h).', 'Dans Réglages : la durée d\'une journée.'], en: ['Under the clock: ⏸ pause, ▶ normal speed, ⏩ fast forward.', '🤖 Auto: your character does the simple chores by itself.', 'To get through the night: go to sleep in the house (from 7 pm).', 'In Settings: the length of a day.'] } },
  { id: 'tasks', icon: '📝', where: null,
    title: { fr: 'Préparer ma liste de tâches', en: 'Plan my task list' },
    keys: 'liste tâches automatique manuel planifier task list auto manual plan',
    steps: { fr: ['Dans un menu d\'actions, appuie sur 📝 à côté d\'une action.', 'Dans « Ma liste » (en bas à droite), choisis 🤖 Auto ou ✋ Moi.', 'Appuie sur ▶ Lancer.'], en: ['In an action menu, tap 📝 next to an action.', 'In "My list" (bottom right), choose 🤖 Auto or ✋ Me.', 'Tap ▶ Start.'] } },
  { id: 'tools', icon: '🧶', where: 'stable',
    title: { fr: 'Acheter du matériel (tondeuse, seau…)', en: 'Buy tools (shears, pail…)' },
    keys: 'matériel outil tondeuse seau shampooing coupe-griffes acheter tools shears pail shampoo buy',
    steps: { fr: ['Va à l\'écurie → « Sellerie ».', 'Dans « Matériel », achète l\'outil qu\'il te faut.', 'Le soin correspondant devient possible.'], en: ['Go to the stable → "Tack room".', 'In "Tools", buy the tool you need.', 'The matching care becomes possible.'] } },
  { id: 'money', icon: '🪙', where: 'jobs',
    title: { fr: 'Gagner de l\'argent', en: 'Earn money' },
    keys: 'argent pièces gagner travail boulot laine lait money coins earn job wool milk',
    steps: { fr: ['Fais des petits boulots (panneau près de la maison).', 'Vends la laine et le lait (tonte et traite).', 'Termine des quêtes (📖 Journal).'], en: ['Do odd jobs (board near the house).', 'Sell wool and milk (shearing and milking).', 'Complete quests (📖 Journal).'] } },
  { id: 'sleep', icon: '🛏️', where: 'house',
    title: { fr: 'Dormir', en: 'Sleep' },
    keys: 'dormir nuit lit maison sleep night bed house',
    steps: { fr: ['Va à la maison le soir (à partir de 19 h).', 'Touche « Dormir jusqu\'au matin ».'], en: ['Go to the house in the evening (from 7 pm).', 'Tap "Sleep until morning".'] } },
];

const norm = (str) => str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Fiches qui correspondent à la question tapée (meilleures d'abord). */
const STOP = new Set(['les', 'des', 'une', 'mon', 'mes', 'ton', 'tes', 'est', 'sont', 'comment', 'faire', 'pour', 'avec', 'que', 'qui', 'quoi', 'the', 'how', 'and', 'can', 'est-ce', 'faut', 'peux', 'veux']);

export function searchHelp(query) {
  const words = norm(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return TOPICS;
  const wordsOf = (str) => norm(str).split(/[^a-z0-9]+/);
  const hayOf = (topic) => wordsOf(`${topic.keys} ${topic.title.fr} ${topic.title.en} ${topic.steps.fr.join(' ')}`);
  // On compare des mots entiers (ou leur début : « cheva » trouve « cheval »).
  const has = (hay, w) => hay.some((x) => x === w || (w.length > 3 && x.startsWith(w)) || (x.length > 3 && w.startsWith(x)));
  // Un mot rare (présent dans peu de fiches) compte plus qu'un mot fréquent.
  const weight = (w) => 3 / Math.max(1, TOPICS.filter((x) => has(hayOf(x), w)).length);
  return TOPICS
    .map((topic) => {
      const hay = hayOf(topic);
      const keys = wordsOf(topic.keys);
      const score = words.reduce((n, w) => n + (has(hay, w) ? weight(w) * (has(keys, w) ? 2 : 1) : 0), 0);
      return { topic, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.topic);
}

/** « Montre-moi » : on fait clignoter le bouton de l'écran, ou on guide vers le bâtiment. */
function showMe(ui, where) {
  const g = ui.game;
  ui.closePanel();
  if (where?.startsWith('hud:')) {
    // Le bouton est reconnu par son titre (comme dans src/ui/tutorial.js), pas par sa position.
    const el = where === 'hud:time' ? document.querySelector('.time-bar')
      : [...document.querySelectorAll('.hud-buttons .hud-btn')].find((b) => b.title === t(where.slice(4))) ?? null;
    el?.classList.add('pulse');
    setTimeout(() => el?.classList.remove('pulse'), 5000);
    return;
  }
  const spot = g.buildingSpot(where);
  if (!spot) return ui.toast(t('helpNotHere'));
  if (g.marker?.show) g.marker.show(spot);
  ui.toast(t('helpGoing'));
  g.walkTo(spot, 1.5, () => ui.openBuilding(where));
}

export function openHelp(ui) {
  const st = { q: '', open: null };
  // Le champ et son en-tête sont créés une seule fois et ne sont jamais redessinés : déplacer le champ
  // dans la page lui fait perdre le focus (sur iPhone, le clavier se fermait après chaque lettre).
  // Taper ne redessine que la liste des fiches (results).
  const input = h('input', {
    type: 'search', id: 'help-search', placeholder: t('helpSearch'), value: '',
    enterkeyhint: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none', spellcheck: 'false',
  });
  const results = h('div', { class: 'help-results' });
  const head = [h('p', { class: 'note' }, t('helpIntro')), h('label', { class: 'field' }, input)];
  const drawList = () => {
    const list = searchHelp(st.q);
    results.replaceChildren(
      list.length ? '' : h('p', { class: 'note' }, t('helpNothing')),
      h('div', { class: 'help-list' }, list.map((topic) => {
        const open = st.open === topic.id || (st.q && list[0] === topic);
        return h('div', { class: `help-topic ${open ? 'open' : ''}` },
          h('button', { class: 'help-title', onClick: () => { st.open = open ? null : topic.id; drawList(); } }, `${topic.icon} ${L(topic.title)}`),
          open ? h('ol', { class: 'help-steps' }, (topic.steps[getLang()] ?? topic.steps.fr).map((step) => h('li', {}, step))) : null,
          open && topic.where ? h('button', { class: 'primary', onClick: () => showMe(ui, topic.where) }, `👉 ${t('helpShowMe')}`) : null);
      })));
  };
  input.addEventListener('input', () => { st.q = input.value; drawList(); });
  // Entrée (« Rechercher » du clavier) : on garde les résultats et on ferme le clavier pour les voir.
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    input.blur();
  });
  ui.openPanel({
    title: `❓ ${t('help')}`,
    render: () => {
      drawList();
      return [...head, results];
    },
  });
}

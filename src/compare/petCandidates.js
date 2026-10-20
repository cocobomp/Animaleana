// Page « Chats et lapins » (chats-lapins.html) : les rendus comparés, les allures et poses, les robes et les
// races de chaque espèce. Les modèles GLB sont dans public/compare-chats-lapins/ (pas dans public/models/ :
// ils ne font pas partie du jeu, ni du service worker, ni de la version « à emporter »). Licences : CC0 1.0
// ou CC-BY 4.0 (attribution obligatoire), voir CREDITS.md et public/compare-chats-lapins/LICENSES/.
//
// Normes communes des GLB (faites par les équipes chats et lapins) : animal tourné vers +Z, Y en haut, pattes
// à y = 0 dans les clips, allures sur place et bouclées, transitions jouées une fois. Chats : garrot 0,25 m,
// squelette commun (root, pelvis, spine1-3, chest, neck1-2, head, ear1/ear2, tail1-8, humerus… htoes).
// Lapins : nez-croupe 0,35 m (≈ 0,20 m de haut accroupi), noms d'os communs.

const BASE = `${import.meta.env?.BASE_URL ?? './'}compare-chats-lapins/`;

// ------------------------------------------------------------------ poses et transitions des GLB

/**
 * Graphe des poses d'une espèce : pose de chaque allure ou position de la page (gait → pose + clip bouclé),
 * transitions jouées une fois entre deux poses (clip), et passages sans clip (fondu). Le chemin le plus court
 * est cherché à chaque changement (un chat debout qui doit se mettre en boule s'assoit, se couche, puis
 * s'enroule).
 */
export const POSE_GRAPH = {
  cat: {
    rest: 'stand',
    gaits: {
      stop: { pose: 'stand', clip: 'idle' },
      walk: { pose: 'stand', clip: 'walk', moving: true },
      run: { pose: 'stand', clip: 'run', moving: true },
      sit: { pose: 'sit', clip: 'sit' },
      lie: { pose: 'lie', clip: 'lie' },
      curl: { pose: 'curl', clip: 'sleep' },
      groom: { pose: 'sit', clip: 'groom' },
    },
    // [de, vers, clip] (clip null : fondu)
    edges: [
      ['stand', 'sit', 'sit_down'], ['sit', 'stand', 'stand_up'], ['sit', 'lie', 'lie_down'],
      ['lie', 'stand', 'get_up'], ['lie', 'curl', 'curl_up'], ['curl', 'lie', null],
    ],
  },
  rabbit: {
    rest: 'crouch',
    gaits: {
      stop: { pose: 'crouch', clip: 'idle' },
      hop: { pose: 'crouch', clip: 'hop', moving: true },
      run: { pose: 'crouch', clip: 'run', moving: true },
      sit: { pose: 'sit', clip: 'sit' },
      stand: { pose: 'rear', clip: 'stand' },
      lie: { pose: 'lie', clip: 'lie' },
      groom: { pose: 'sit', clip: 'groom' },
    },
    edges: [
      ['crouch', 'sit', 'sit_down'], ['sit', 'crouch', 'stand_up'], ['sit', 'rear', 'rear_up'],
      ['rear', 'sit', 'rear_down'], ['crouch', 'lie', 'lie_down'], ['lie', 'crouch', 'get_up'],
    ],
  },
};

// ------------------------------------------------------------------ allures et positions des boutons

/** v : vitesse visée (m/s) pour un animal de taille 1 (chat : garrot 0,25 m ; lapin : 0,35 m de long). */
export const GAITS = {
  cat: [
    { id: 'stop', label: 'Arrêt', v: 0 },
    { id: 'walk', label: 'Pas', v: 0.6 },
    { id: 'run', label: 'Course', v: 4 },
    { id: 'sit', label: 'Assis', v: 0 },
    { id: 'lie', label: 'Couché', v: 0 },
    { id: 'curl', label: 'En boule', v: 0 },
    { id: 'groom', label: 'Toilette', v: 0 },
  ],
  rabbit: [
    { id: 'stop', label: 'Arrêt', v: 0 },
    { id: 'hop', label: 'Sautille', v: 0.45 },
    { id: 'run', label: 'Course', v: 1.8 },
    { id: 'sit', label: 'Assis', v: 0 },
    { id: 'stand', label: 'Debout', v: 0 },
    { id: 'lie', label: 'Couché', v: 0 },
    { id: 'groom', label: 'Toilette', v: 0 },
  ],
};

// ------------------------------------------------------------------ robes

// Couleurs d'yeux du jeu (src/sim/catBreeds.js).
const BLUE = 0x3f86dc;
const GOLD = 0xd8aa34;
const COPPER = 0xd9822a;
const GREEN = 0x6aa84a;

/**
 * Robes. Pour les GLB (petRecolor.js) : pattern ('solid' unie, 'tabby' tigré, 'tricolor', 'points' colourpoint,
 * 'rosettes' tacheté bengal, 'agouti', 'pie'), base (couleur principale), tan (rayures, taches, pointe des
 * poils), white (ventre, plastron, fond des robes pie et colourpoint). game : la même robe pour l'animal du jeu
 * (coat, secondary, third, pattern du look, voir src/game/catTextures.js et src/game/textures.js).
 */
export const COATS = {
  cat: [
    {
      id: 'roux_tigre', label: 'Roux tigré', pattern: 'tabby', base: 0xdf9450, tan: 0xa44d17, white: 0xf3dcbc,
      game: { coat: 0xd9873e, secondary: 0xa3561e, pattern: 'tabby', eye: GOLD },
    },
    { id: 'noir', label: 'Noir', pattern: 'solid', base: 0x1c1918, game: { coat: 0x161414, secondary: 0x161414, pattern: 'solid', eye: 0xd6b23a } },
    { id: 'blanc', label: 'Blanc', pattern: 'solid', base: 0xf2efe8, game: { coat: 0xf5f3ee, secondary: 0xf5f3ee, pattern: 'solid', eye: BLUE } },
    { id: 'chartreux', label: 'Gris chartreux', pattern: 'solid', base: 0x7a828b, game: { coat: 0x7d848c, secondary: 0x7d848c, pattern: 'solid', eye: 0xd9902a } },
    {
      id: 'tricolore', label: 'Tricolore', pattern: 'tricolor', base: 0x221d1a, tan: 0xd08640, white: 0xf3efe7,
      game: { coat: 0xf3efe7, secondary: 0xd28940, third: 0x231e1b, pattern: 'tricolor', eye: GOLD },
    },
    {
      id: 'siamois', label: 'Points siamois', pattern: 'points', base: 0x3b2a20, white: 0xeadfca,
      game: { coat: 0xe9dcc6, secondary: 0x3b2a20, pattern: 'points', eye: 0x2a63c8 },
    },
    {
      id: 'bengal', label: 'Tacheté bengal', pattern: 'rosettes', base: 0xd59c56, tan: 0x2b1a10, white: 0xf2e2c4,
      game: { coat: 0xd49a52, secondary: 0x2b1a10, pattern: 'rosettes', eye: GREEN },
    },
  ],
  rabbit: [
    {
      id: 'agouti', label: 'Gris agouti', pattern: 'agouti', base: 0x7c6d5c, tan: 0x2f2620, white: 0xe6dfd3,
      game: { coat: 0x8f8a84, secondary: 0xd9d3cb, pattern: 'solid' },
    },
    { id: 'blanc', label: 'Blanc', pattern: 'solid', base: 0xf3f1ec, game: { coat: 0xf7f5f0, secondary: 0xf7f5f0, pattern: 'solid' } },
    { id: 'noir', label: 'Noir', pattern: 'solid', base: 0x1d1a19, game: { coat: 0x1d1a19, secondary: 0x1d1a19, pattern: 'solid' } },
    {
      id: 'fauve', label: 'Fauve', pattern: 'agouti', base: 0xc99456, tan: 0xa8743c, white: 0xf0e2c8,
      game: { coat: 0xc39566, secondary: 0xe6cfb1, pattern: 'solid' },
    },
    {
      id: 'pie', label: 'Pie', pattern: 'pie', base: 0x2a2523, white: 0xf4f1eb,
      game: { coat: 0xf3f0ea, secondary: 0x2f2a27, pattern: 'patches' },
    },
  ],
};

// ------------------------------------------------------------------ races

/**
 * Races : id de la race du jeu (src/sim/species.js, src/sim/catBreeds.js : taille, et tout le gabarit pour
 * l'animal du jeu). Pour les GLB : taille de la race du jeu (breed.scale), puis proportions par les os et le
 * shader : legs (longueur des pattes), legW (épaisseur), back (longueur du dos), girth (largeur du tronc), head
 * (taille de la tête), neck (encolure), muzzle (longueur du museau : < 1 face plate), fluff (poil : épaisseur
 * gonflée le long de la peau, en m ; négatif = plus fin), ruff (collerette : gonflement du cou et des joues, m),
 * tail (queue plus épaisse), ears (taille des oreilles), earPose ('fold' pliées en avant, 'lop' tombantes,
 * 'up' dressées), hairless (poil ras : le grain de la fourrure peinte est presque effacé) et skin (couleur de la
 * peau nue, montrée avec la robe « d'origine »).
 */
const ONE = { legs: 1, legW: 1, back: 1, girth: 1, head: 1, neck: 1, muzzle: 1, fluff: 0, ruff: 0, tail: 1, ears: 1, earPose: null, hairless: false };
export const BREEDS = {
  cat: [
    { ...ONE, id: 'europeen', label: 'Européen' },
    { ...ONE, id: 'persan', label: 'Persan', legs: 0.8, legW: 1.12, back: 0.94, girth: 1.14, head: 1.12, neck: 0.8, muzzle: 0.45, fluff: 0.011, ruff: 0.012, tail: 1.5, ears: 0.62 },
    { ...ONE, id: 'maine_coon', label: 'Maine coon', legs: 1.04, legW: 1.12, back: 1.08, girth: 1.08, head: 1.04, muzzle: 1.08, fluff: 0.008, ruff: 0.016, tail: 1.6, ears: 1.2 },
    { ...ONE, id: 'siamois', label: 'Siamois', legs: 1.12, legW: 0.84, back: 1.06, girth: 0.84, head: 0.94, neck: 1.12, muzzle: 1.25, fluff: -0.003, tail: 0.8, ears: 1.35 },
    { ...ONE, id: 'sphynx', label: 'Sphynx', legW: 0.9, girth: 0.96, head: 1.0, neck: 1.05, muzzle: 0.95, fluff: -0.004, tail: 0.75, ears: 1.55, hairless: true, skin: 0xd59d88 },
    { ...ONE, id: 'scottish_fold', label: 'Scottish fold', legs: 0.9, legW: 1.06, girth: 1.08, head: 1.1, neck: 0.85, muzzle: 0.75, fluff: 0.004, ears: 0.8, earPose: 'fold' },
  ],
  rabbit: [
    { ...ONE, id: 'nain', label: 'Nain', legs: 0.82, back: 0.85, girth: 1.06, head: 1.3, neck: 0.8, muzzle: 0.75, ears: 0.62, earPose: 'up' },
    { ...ONE, id: 'belier', label: 'Bélier', legs: 0.95, girth: 1.12, head: 1.12, neck: 0.9, muzzle: 0.9, fluff: 0.003, ears: 1.08, earPose: 'lop' },
    { ...ONE, id: 'angora', label: 'Angora', girth: 1.06, head: 1.05, fluff: 0.022, ruff: 0.01, ears: 0.92, earPose: 'up' },
    { ...ONE, id: 'geant_flandres', label: 'Géant des Flandres', legs: 1.04, legW: 1.08, back: 1.15, girth: 1.12, head: 1.0, ears: 1.1, earPose: 'up' },
    { ...ONE, id: 'tete_de_lion', label: 'Tête de lion', back: 0.92, girth: 1.04, head: 1.15, neck: 0.85, muzzle: 0.85, fluff: 0.004, ruff: 0.03, ears: 0.7, earPose: 'up' },
  ],
};

// Race « d'origine » : chaque modèle tel que l'artiste l'a fait (taille 1, sans retouche des proportions) ;
// l'animal du jeu est alors un européen (chat) ou un rex (lapin : la race « moyenne » du jeu).
export const ORIGIN_BREED = { ...ONE, id: 'origine', label: 'D’origine' };
export const ORIGIN_GAME_BREED = { cat: 'europeen', rabbit: 'rex' };

// ------------------------------------------------------------------ rendus comparés

// Os communs aux cinq chats (squelette fait par l'équipe des chats).
const CAT_RIG = {
  head: 'head',
  neck: ['neck1', 'neck2', 'head'],
  ears: [['ear1L', 'ear2L'], ['ear1R', 'ear2R']],
  tail: 'tail1',
  legs: [
    { top: 'humerusL', end: 'metacarpusL' },
    { top: 'humerusR', end: 'metacarpusR' },
    { top: 'femurL', end: 'metatarsusL' },
    { top: 'femurR', end: 'metatarsusR' },
  ],
};
const RABBIT_LEGS = [
  { top: 'humerusL', end: 'metacarpusL' },
  { top: 'humerusR', end: 'metacarpusR' },
  { top: 'femurL', end: 'metatarsusL' },
  { top: 'femurR', end: 'metatarsusR' },
];
const CAT_ANIM = 'Repos, pas, trot, course, assis, couché, en boule, toilette, étirement, queue levée et transitions faits pour le jeu (le modèle n’avait pas de squelette)';
const RABBIT_ANIM = 'Accroupi, sautillement, course en bonds, saut, assis, debout, couché, en boule, toilette, renifler, manger, binky et transitions faits pour le jeu';

/**
 * Rendus comparés. kind 'proc' : l'animal actuel du jeu (catModel.js et catAnim.js pour le chat,
 * animalModel.js et AnimalEntity.animate pour le lapin). kind 'glb' : un modèle animé, avec :
 * - head, neck, ears ([[os de base, os suivants…] par oreille]), tail, legs (top = épaule ou hanche, end = poignet
 *   ou jarret) : proportions des races ;
 * - earRest : oreilles du fichier au repos ('up' dressées, 'lop' tombantes) ; earK : taille des oreilles pour les
 *   races (sauf « d'origine ») ;
 * - fur : rôle des matières pour la robe ('fur' poil recoloré, 'keep' gardée telle quelle) ;
 * - keep : ce qui garde sa couleur d'origine dans la texture : dark (luminance sous laquelle un texel de la tête
 *   est gardé : yeux peints), pink (truffe et intérieur des oreilles roses), green (yeux verts peints), uv
 *   (rectangles [u0, v0, u1, v1] de la texture gardés : yeux, truffe), spheres ([os ou 'tip', rayon, luminance]) ;
 * - grain : force du grain du poil d'origine sous la nouvelle robe ;
 * - speeds : vitesses naturelles (m/s) des allures (manifestes des équipes) ;
 * - tris / bytes : remplis au chargement.
 */
export const CANDIDATES = {
  cat: [
    {
      id: 'actuel_chat',
      kind: 'proc',
      name: 'Actuel (dessiné par le jeu)',
      style: 'Sculpté par le code : tronc et tête en formes fondues, pattes et queue en tubes à os, poil en couches (shells) ; 15 races',
      author: 'La ferme à Madichelle (code du jeu)',
      license: 'Code du jeu',
      links: [],
      anim: 'Calculée en direct par le jeu (catAnim.js) : pas, course, assis, toilette, couché en sphinx, en boule, queue levée',
    },
    {
      id: 'claire_grey',
      kind: 'glb',
      file: `${BASE}claire_grey.glb`,
      name: 'Chat tigré gris réaliste (Claire)',
      style: 'Réaliste : pelage gris tigré peint, relief et ombres (PBR 1024), yeux à part (vairons jaune et bleu)',
      author: 'Claire (claireanne3d, Sketchfab, « Cat game asset », 2019) ; squelette et animations faits pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2']],
      anim: CAT_ANIM,
      ...CAT_RIG,
      earRest: 'up',
      eyes: ['eyeL', 'eyeR'],
      fur: { cat_eye: 'keep' },
      keep: { pink: true, spheres: [['tip', 0.012, 0.3]] },
      grain: 0.8,
      speeds: { walk: 0.541, trot: 1.619, run: 5.779 },
    },
    {
      id: 'lily_tuxedo',
      kind: 'glb',
      file: `${BASE}lily_tuxedo.glb`,
      name: 'Chat noir et blanc réaliste (lilyjoyhanna)',
      style: 'Réaliste : chat « smoking » à plastron et chaussettes blanches, moustaches et sourcils en pièces fines',
      author: 'lilyjoyhanna (Sketchfab, « My Cat Modeled », 2020) ; squelette et animations faits pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/my-cat-modeled-28d33c1592e14d8b895d36a1e0dfaa5d']],
      anim: CAT_ANIM,
      ...CAT_RIG,
      earRest: 'up',
      eyes: ['eyeL', 'eyeR'],
      fur: { cat_eye: 'keep', cat_detail: 'keep' },
      keep: { pink: true, spheres: [['tip', 0.012, 0.25]] },
      grain: 0.7,
      speeds: { walk: 0.542, trot: 1.618, run: 5.804 },
    },
    {
      id: 'faino_kitten',
      kind: 'glb',
      file: `${BASE}faino_kitten.glb`,
      name: 'Chaton tigré gris réaliste (FainoDS)',
      style: 'Réaliste et mignon : chaton à grosse tête et grands yeux, pelage peint 1024 avec relief',
      author: 'FainoDS (doinspire, Sketchfab, « Kitten », 2018) ; squelette et animations faits pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/kitten-4ae3704cd65b423ab994545988d4db1a']],
      anim: `${CAT_ANIM}. Allures plus courtes (pattes de chaton)`,
      warn: 'Proportions de chaton (grosse tête, pattes courtes) : il serait le chaton du jeu plutôt que le chat adulte.',
      ...CAT_RIG,
      earRest: 'up',
      fur: { cat_eye: 'keep' },
      keep: { pink: true, dark: 0.05, spheres: [['tip', 0.012, 0.25]] },
      grain: 0.7,
      speeds: { walk: 0.41, trot: 1.191, run: 3.63 },
    },
    {
      id: 'syaharani_roux',
      kind: 'glb',
      file: `${BASE}syaharani_roux.glb`,
      name: 'Chat roux tigré (syaharanichan)',
      style: 'Réaliste de loin : texture photo 512 × 1024, ventre blanc, moustaches ; maillage très léger, anguleux de près',
      author: 'Erina eka syaharani (syaharanichan, Sketchfab, « cat Walk », 2020) ; squelette et animations refaits pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/cat-walk-fc6e597a81ce4dc291dcca6a9e6888ba']],
      anim: CAT_ANIM.replace('faits pour le jeu (le modèle n’avait pas de squelette)', 'refaits pour le jeu (squelette et marche d’origine remplacés)'),
      warn: 'Provenance non documentée (page sans description, texture « GatoTextura.jpg ») : à valider avant une diffusion commerciale.',
      ...CAT_RIG,
      earRest: 'up',
      keep: { pink: true, dark: 0.06, uv: [[0.86, 0.84, 1, 1], [0.84, 0.48, 0.98, 0.56]], spheres: [['tip', 0.012, 0.3]] },
      grain: 0.6,
      speeds: { walk: 0.541, trot: 1.61, run: 6.05 },
    },
    {
      id: 'sheldon_roux',
      kind: 'glb',
      file: `${BASE}sheldon_roux.glb`,
      name: 'Chat roux à plastron blanc (luketmcfarlane)',
      style: 'Semi-réaliste : roux uni à plastron et pattes blanches, relief cuit, moustaches à part',
      author: 'luketmcfarlane (Sketchfab, « Sheldon The Cat », 2018) ; maillage allégé, squelette et animations faits pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/sheldon-the-cat-b1cccd4b743b469dac8527480584f9fb']],
      anim: CAT_ANIM,
      ...CAT_RIG,
      earRest: 'up',
      // (yeux peints dans la texture)
      keep: { pink: true, dark: 0.05, uv: [[0.312, 0.113, 0.347, 0.148], [0.356, 0.157, 0.391, 0.192]], spheres: [['tip', 0.012, 0.3]] },
      grain: 0.6,
      speeds: { walk: 0.541, trot: 1.619, run: 5.795 },
    },
  ],
  rabbit: [
    {
      id: 'actuel_lapin',
      kind: 'proc',
      name: 'Actuel (dessiné par le jeu)',
      style: 'Sculpté par le code (modèle commun des animaux) : formes fondues, pattes en tubes, poil en couches (shells)',
      author: 'La ferme à Madichelle (code du jeu)',
      license: 'Code du jeu',
      links: [],
      anim: 'Calculée en direct par le jeu (AnimalEntity) : il sautille en se déplaçant et se tasse pour dormir ; pas d’assis, de debout ni de toilette',
    },
    {
      id: 'cdmir_garenne',
      kind: 'glb',
      file: `${BASE}cdmir_garenne.glb`,
      name: 'Lapin de garenne réaliste (CDmir)',
      style: 'Réaliste : garenne agouti, texture peinte avec relief, fourrure en cartes de poils (alpha)',
      author: 'CDmir (Čestmír Dammer), avec TinyWorlds, projet Kelgar (OpenGameArt, « Rabbit », 2015) ; animations complétées pour le jeu',
      license: 'CC0 1.0 (domaine public)',
      links: [['source', 'https://opengameart.org/content/rabbit-0']],
      anim: 'Course, saut, assis et guetteur faits main par l’artiste ; accroupi, sautillement, debout, couché, en boule, toilette, renifler, manger, binky et transitions faits pour le jeu',
      head: 'head',
      neck: ['neck1', 'head'],
      ears: [['ear1L'], ['ear1R']],
      tail: 'tail1',
      legs: RABBIT_LEGS,
      earRest: 'up',
      keep: { pink: true, dark: 0.045 },
      grain: 0.75,
      speeds: { hop: 0.283, run: 0.87 },
    },
    {
      id: 'dakota_gris',
      kind: 'glb',
      file: `${BASE}dakota_gris.glb`,
      name: 'Lapin gris réaliste (Dakota.Hinkle)',
      style: 'Réaliste : gris agouti, texture photo 1024, yeux en sphères à part ; la plus belle tête',
      author: 'Dakota.Hinkle (Sketchfab, « Rabbit ») ; animations faites pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67']],
      anim: RABBIT_ANIM,
      head: 'head',
      neck: ['neck1', 'head'],
      ears: [['ear1L'], ['ear1R']],
      tail: 'tail1',
      legs: RABBIT_LEGS,
      earRest: 'up',
      fur: { rabbit_eye: 'keep' },
      keep: { pink: true },
      grain: 0.75,
      speeds: { hop: 0.273, run: 1.263 },
    },
    {
      id: 'fourthgreen_belier',
      kind: 'glb',
      file: `${BASE}fourthgreen_belier.glb`,
      name: 'Lapin bélier fauve (FourthGreen)',
      style: 'Réaliste : fauve, oreilles tombantes modélisées (3 os par oreille), moustaches en fils ; texture 256 un peu floue',
      author: 'FourthGreen (Sketchfab, « Rabbit Rigged ») ; animations faites pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/rabbit-rigged-e7213589744d436b9d96e2dbb31198a5']],
      anim: `${RABBIT_ANIM} ; bond rapide d’origine gardé`,
      head: 'head',
      neck: ['neck1', 'head'],
      ears: [['ear1L', 'ear2L', 'ear3L'], ['ear1R', 'ear2R', 'ear3R']],
      tail: 'tail1',
      legs: RABBIT_LEGS,
      earRest: 'lop',
      keep: { pink: true, dark: 0.05 },
      grain: 0.7,
      speeds: { hop: 0.281, run: 0.731 },
    },
    {
      id: 'victory_hollandais',
      kind: 'glb',
      file: `${BASE}victory_hollandais.glb`,
      name: 'Lapin hollandais noir et blanc (victory_)',
      style: 'Réaliste stylisé : robe hollandaise, yeux verts peints, oreilles très longues et fines',
      author: 'victory_ (Paleo Modelist, Sketchfab, « Rabbit ») ; animations faites pour le jeu',
      license: 'CC-BY 4.0 (attribution obligatoire)',
      links: [['source', 'https://sketchfab.com/3d-models/rabbit-ce07bc73ca66435680e227767725f3f8']],
      anim: RABBIT_ANIM,
      head: 'head',
      neck: ['neck1', 'neck2', 'head'],
      ears: [['ear1L', 'ear2L'], ['ear1R', 'ear2R']],
      tail: 'tail1',
      legs: RABBIT_LEGS,
      earRest: 'up',
      earK: 0.8, // (oreilles très longues : raccourcies pour les races)
      keep: { pink: true, green: true },
      grain: 0.7,
      speeds: { hop: 0.284, run: 1.264 },
    },
    {
      id: 'rattel_peint',
      kind: 'glb',
      file: `${BASE}rattel_peint.glb`,
      name: 'Lapin peint à la main (Rattel)',
      style: 'Stylisé : low-poly peint à la main, blanc à taches noires, intérieur des oreilles rose ; facettes visibles',
      author: 'Rattel (OpenGameArt, « Hand-painted bunny (unrigged version) », 2020) ; squelette et animations faits pour le jeu',
      license: 'CC0 1.0 (domaine public)',
      links: [['source', 'https://opengameart.org/content/hand-painted-bunny-unrigged-version']],
      anim: `${RABBIT_ANIM} (le modèle n’avait pas de squelette)`,
      head: 'head',
      neck: ['neck1', 'head'],
      ears: [['ear1L', 'ear2L'], ['ear1R', 'ear2R']],
      tail: 'tail1',
      legs: RABBIT_LEGS,
      earRest: 'up',
      // (œil peint dans la texture)
      keep: { pink: true, uv: [[0.385, 0, 0.55, 0.105]] },
      grain: 0.5,
      speeds: { hop: 0.283, run: 1.02 },
    },
  ],
};

/** Cadrage d'un animal de taille 1 dans une carte (m) : hauteur du point visé, demi-hauteur et demi-largeur à montrer. */
export const FRAME = {
  cat: { y: 0.17, h: 0.24, r: 0.36 },
  rabbit: { y: 0.14, h: 0.22, r: 0.27 },
};

export const SPECIES_LABEL = { cat: 'Chats', rabbit: 'Lapins' };

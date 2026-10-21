// Races de chats : apparence (taille, poil, tête, oreilles, yeux), robes, tempérament et prix.
// Données pures (aucune 3D), importées par species.js et testées dans tests/catBreeds.test.js.
//
// Champs propres aux chats, recopiés dans animal.look (voir resolveLook) :
//   hair  : 'short' (ras), 'plush' (dense, peluche), 'semi' (mi-long), 'long', 'curly' (frisé), 'hairless' (nu)
//   head  : 'balanced', 'round', 'flat' (face plate), 'wedge' (triangle long), 'modwedge', 'square', 'pixie'
//   build : 'semi', 'cobby' (trapu), 'foreign' (fin), 'large' (grand), 'muscular'
//   eyes  : 'round', 'oval', 'almond' (en amande)
// earType : 'cat' (moyennes), 'cat_big' (grandes), 'cat_small' (petites, arrondies), 'cat_fold' (pliées),
//           'cat_lynx' (grandes, avec pinceaux).
// Motifs (pattern) : 'solid', 'tabby' (tigré), 'classic' (marbré), 'rosettes' (tacheté), 'ticked' (agouti),
//   'points' (colourpoint : masque, oreilles, pattes, queue), 'tricolor', 'tortie' (écaille), 'bicolor'.
// white : taches blanches par-dessus le motif : 'gloves' (gants), 'mitted', 'bicolor', 'chest', 'van'.
// eye / eye2 : couleur des yeux (eye2 : l'autre œil, pour les yeux vairons).

const C = (fr, en, coat, secondary, extra = {}) => ({ name: { fr, en }, coat, secondary, ...extra });

// Couleurs d'yeux.
const BLUE = 0x3f86dc;
const DEEP_BLUE = 0x2a63c8;
const COPPER = 0xd9822a;
const ORANGE = 0xe0901e;
const GOLD = 0xd8aa34;
const GREEN = 0x6aa84a;
const HAZEL = 0xa3a83c;

export const CAT_HAIR = ['short', 'plush', 'semi', 'long', 'curly', 'hairless'];
export const CAT_HEADS = ['balanced', 'round', 'flat', 'wedge', 'modwedge', 'square', 'pixie'];
export const CAT_BUILDS = ['semi', 'cobby', 'foreign', 'large', 'muscular'];
export const CAT_EYES = ['round', 'oval', 'almond'];
export const CAT_EARS = ['cat', 'cat_big', 'cat_small', 'cat_fold', 'cat_lynx'];
export const CAT_PATTERNS = ['solid', 'tabby', 'classic', 'rosettes', 'ticked', 'points', 'tricolor', 'tortie', 'bicolor'];
export const CAT_WHITE = ['gloves', 'mitted', 'bicolor', 'chest', 'van'];

export const CAT_BREEDS = [
  {
    id: 'europeen', name: { fr: 'Européen', en: 'European shorthair' }, origin: null, rarity: 1, scale: 1, price: 80,
    look: { hair: 'short', head: 'balanced', build: 'semi', eyes: 'round' },
    temper: ['curious', 'playful'],
    desc: { fr: 'Le chat de gouttière : robuste, malin et joueur.', en: 'The everyday cat: sturdy, clever and playful.' },
    pattern: 'tabby',
    colors: [
      C('Tigré gris', 'Grey tabby', 0x8b8780, 0x3e3a36, { eye: HAZEL }),
      C('Roux tigré', 'Ginger tabby', 0xd9873e, 0xa3561e, { eye: GOLD }),
      C('Noir', 'Black', 0x161414, 0x161414, { pattern: 'solid', eye: 0xd6b23a }),
      C('Tricolore', 'Calico', 0xf3efe7, 0xd28940, { pattern: 'tricolor', third: 0x231e1b, eye: GOLD }),
      C('Smoking', 'Tuxedo', 0x171515, 0xf3f0ea, { pattern: 'bicolor', eye: HAZEL }),
      C('Écaille de tortue', 'Tortoiseshell', 0x201917, 0xb8692e, { pattern: 'tortie', eye: ORANGE }),
      C('Tigré brun et blanc', 'Brown tabby and white', 0x9a7a55, 0x2e2117, { pattern: 'classic', white: 'bicolor', eye: GREEN }),
      C('Blanc', 'White', 0xf5f3ee, 0xf5f3ee, { pattern: 'solid', eye: BLUE }),
    ],
  },
  {
    id: 'ragdoll', name: { fr: 'Ragdoll', en: 'Ragdoll' }, origin: null, rarity: 2, scale: 1.2, fluff: 1.22, price: 180,
    look: { hair: 'semi', head: 'modwedge', build: 'large', eyes: 'oval' },
    temper: ['cuddly', 'calm'],
    desc: { fr: 'Grand, très doux, yeux bleus : il se laisse porter comme une poupée de chiffon.', en: 'Big and very gentle with blue eyes: goes limp like a rag doll in your arms.' },
    pattern: 'points',
    colors: [
      C('Seal mitted', 'Seal mitted', 0xeee2cc, 0x3d2a20, { white: 'mitted', eye: BLUE }),
      C('Blue mitted', 'Blue mitted', 0xe9e9ec, 0x6f7a89, { white: 'mitted', eye: BLUE }),
      C('Seal bicolore', 'Seal bicolour', 0xf1e7d6, 0x3d2a20, { white: 'bicolor', eye: BLUE }),
      C('Blue bicolore', 'Blue bicolour', 0xeceef0, 0x6f7a89, { white: 'bicolor', eye: BLUE }),
      C('Chocolat point', 'Chocolate point', 0xf3eadb, 0x6b4733, { eye: BLUE }),
      C('Lilas mitted', 'Lilac mitted', 0xf2eeea, 0xa89aa2, { white: 'mitted', eye: BLUE }),
    ],
  },
  {
    id: 'maine_coon', name: { fr: 'Maine coon', en: 'Maine coon' }, origin: 'canada', rarity: 2, scale: 1.32, fluff: 1.3, legs: 1.05, price: 190,
    earType: 'cat_lynx',
    look: { hair: 'long', head: 'square', build: 'large', eyes: 'oval' },
    temper: ['calm', 'playful'],
    desc: { fr: 'Le géant gentil : collerette, pinceaux aux oreilles, queue en panache.', en: 'The gentle giant: big ruff, tufted ears and a plumed tail.' },
    pattern: 'classic',
    colors: [
      C('Brun tigré', 'Brown tabby', 0x8a6640, 0x33241a, { eye: GOLD }),
      C('Roux', 'Red', 0xc9763a, 0x8f4a1d, { eye: GOLD }),
      C('Argenté tigré', 'Silver tabby', 0xc4c5c4, 0x2a2a2d, { eye: GREEN }),
      C('Tigré et blanc', 'Tabby and white', 0x8f6e4a, 0x30231a, { white: 'bicolor', eye: GREEN }),
      C('Noir', 'Black', 0x181616, 0x181616, { pattern: 'solid', eye: GOLD }),
    ],
  },
  {
    id: 'persan', name: { fr: 'Persan', en: 'Persian' }, origin: null, rarity: 2, scale: 1, fluff: 1.38, snout: 0.12, legs: 0.82, price: 160,
    earType: 'cat_small',
    look: { hair: 'long', head: 'flat', build: 'cobby', eyes: 'round' },
    temper: ['calm', 'cuddly'],
    desc: { fr: 'Poil long et soyeux, face plate, très calme. Il faut le brosser souvent.', en: 'Long silky coat and a flat face, very calm. Needs lots of brushing.' },
    pattern: 'solid',
    colors: [
      C('Blanc', 'White', 0xf5f3ee, 0xf5f3ee, { eye: 0xd98b2a }),
      C('Crème', 'Cream', 0xe8d2a8, 0xe8d2a8, { eye: COPPER }),
      C('Blanc aux yeux vairons', 'Odd-eyed white', 0xf6f4f0, 0xf6f4f0, { eye: BLUE, eye2: COPPER }),
      C('Bleu', 'Blue', 0x8a929c, 0x8a929c, { eye: COPPER }),
      C('Noir', 'Black', 0x1b1818, 0x1b1818, { eye: COPPER }),
      C('Roux tigré', 'Red tabby', 0xd98a45, 0xa95a24, { pattern: 'classic', eye: COPPER }),
      C('Écaille et blanc', 'Calico', 0xf4f0e8, 0xd08a45, { pattern: 'tricolor', third: 0x231e1b, eye: COPPER }),
    ],
  },
  {
    id: 'siamois', name: { fr: 'Siamois', en: 'Siamese' }, origin: null, rarity: 2, scale: 0.92, legs: 1.12, fluff: 0.95, snout: 1.25, price: 150,
    earType: 'cat_big',
    look: { hair: 'short', head: 'wedge', build: 'foreign', eyes: 'almond' },
    temper: ['playful', 'curious'],
    desc: { fr: 'Fin et élégant, yeux bleus en amande. Très bavard !', en: 'Slim and elegant with almond blue eyes. Very chatty!' },
    pattern: 'points',
    colors: [
      C('Seal point', 'Seal point', 0xe9dcc6, 0x3b2a20, { eye: DEEP_BLUE }),
      C('Blue point', 'Blue point', 0xe6e7ea, 0x5f6b7c, { eye: DEEP_BLUE }),
      C('Chocolat point', 'Chocolate point', 0xf0e6d6, 0x6b4633, { eye: DEEP_BLUE }),
      C('Lilas point', 'Lilac point', 0xefebea, 0x9d8f99, { eye: DEEP_BLUE }),
    ],
  },
  {
    id: 'sacre_birmanie', name: { fr: 'Sacré de Birmanie', en: 'Birman' }, origin: null, rarity: 2, scale: 1.04, fluff: 1.2, price: 160,
    look: { hair: 'semi', head: 'round', build: 'semi', eyes: 'round' },
    temper: ['cuddly', 'calm'],
    desc: { fr: 'Mi-long colourpoint aux yeux bleus et aux quatre gants blancs.', en: 'Semi-longhair colourpoint with blue eyes and four white gloves.' },
    pattern: 'points',
    colors: [
      C('Seal point', 'Seal point', 0xefe4d0, 0x4a3426, { white: 'gloves', eye: BLUE }),
      C('Blue point', 'Blue point', 0xeaeaec, 0x6c7685, { white: 'gloves', eye: BLUE }),
      C('Chocolat point', 'Chocolate point', 0xf2e8d6, 0x70503a, { white: 'gloves', eye: BLUE }),
      C('Lilas point', 'Lilac point', 0xf1edea, 0xa4979f, { white: 'gloves', eye: BLUE }),
    ],
  },
  {
    id: 'bengal', name: { fr: 'Bengal', en: 'Bengal' }, origin: null, rarity: 3, scale: 1.05, legs: 1.05, price: 230,
    earType: 'cat_small',
    look: { hair: 'short', head: 'modwedge', build: 'muscular', eyes: 'oval' },
    temper: ['playful', 'curious'],
    desc: { fr: 'Robe tachetée de rosettes comme un petit léopard. Plein d\'énergie.', en: 'Rosetted coat like a little leopard. Full of energy.' },
    pattern: 'rosettes',
    colors: [
      C('Brun tacheté', 'Brown spotted', 0xd49a52, 0x2b1a10, { eye: GREEN }),
      C('Snow', 'Snow', 0xefe7d8, 0x8a7462, { eye: BLUE }),
      C('Argenté tacheté', 'Silver spotted', 0xd5d6d4, 0x1d1d1f, { eye: GREEN }),
    ],
  },
  {
    id: 'british', name: { fr: 'British shorthair', en: 'British shorthair' }, origin: 'angleterre', rarity: 2, scale: 1.1, fluff: 1.15, snout: 0.25, legs: 0.92, price: 160,
    earType: 'cat_small',
    look: { hair: 'plush', head: 'round', build: 'cobby', eyes: 'round' },
    temper: ['calm', 'stubborn'],
    desc: { fr: 'Tout rond, poil épais comme une peluche, yeux cuivre.', en: 'Round all over, thick plush coat, copper eyes.' },
    pattern: 'solid',
    colors: [
      // (bleu profond, plus foncé que le chartreux ; yeux cuivre foncé)
      C('Bleu', 'Blue', 0x6e7884, 0x6e7884, { eye: 0xc8761e }),
      C('Crème', 'Cream', 0xe6cfa6, 0xe6cfa6, { eye: COPPER }),
      C('Lilas', 'Lilac', 0xb4a8ac, 0xb4a8ac, { eye: ORANGE }),
      C('Argenté tigré', 'Silver tabby', 0xcbcbc9, 0x26262a, { pattern: 'classic', eye: GREEN }),
      C('Bleu et blanc', 'Blue and white', 0x7f8790, 0x7f8790, { white: 'bicolor', eye: COPPER }),
    ],
  },
  {
    id: 'chartreux', name: { fr: 'Chartreux', en: 'Chartreux' }, origin: null, rarity: 2, scale: 1.08, fluff: 1.1, price: 150,
    look: { hair: 'plush', head: 'round', build: 'muscular', eyes: 'round' },
    temper: ['calm', 'shy'],
    desc: { fr: 'Le chat bleu français : fourrure laineuse et grands yeux orange.', en: 'The blue French cat: woolly coat and big orange eyes.' },
    pattern: 'solid',
    // (gris bleu aux reflets argentés, bien plus clair que le bleu du british ; yeux or orangé)
    colors: [C('Gris bleu', 'Blue grey', 0x98a2ad, 0x98a2ad, { eye: 0xeaa53a })],
  },
  {
    id: 'sphynx', name: { fr: 'Sphynx', en: 'Sphynx' }, origin: null, rarity: 3, scale: 0.95, fluff: 0.88, snout: 0.8, price: 240,
    earType: 'cat_big',
    look: { hair: 'hairless', head: 'wedge', build: 'muscular', eyes: 'almond' },
    temper: ['cuddly', 'playful'],
    desc: { fr: 'Sans poils : peau douce et plissée, grandes oreilles. Il adore la chaleur.', en: 'Hairless: soft wrinkly skin and huge ears. Loves to be warm.' },
    pattern: 'solid',
    colors: [
      C('Rose', 'Pink', 0xe9b9a6, 0xe9b9a6, { eye: GREEN }),
      C('Gris', 'Grey', 0xb4a7aa, 0xb4a7aa, { eye: GOLD }),
      C('Crème', 'Cream', 0xf0d2b8, 0xf0d2b8, { eye: BLUE }),
      C('Pie', 'Pied', 0x8a7c80, 0xecc0ae, { pattern: 'bicolor', eye: GOLD }), // peau grise dessus, rose dessous
    ],
  },
  {
    id: 'norvegien', name: { fr: 'Norvégien', en: 'Norwegian forest cat' }, origin: 'islande', rarity: 2, scale: 1.2, fluff: 1.35, price: 170,
    earType: 'cat_lynx',
    look: { hair: 'long', head: 'modwedge', build: 'large', eyes: 'oval' },
    temper: ['calm', 'curious'],
    desc: { fr: 'Robuste chat des forêts au poil long, imperméable à la neige.', en: 'Sturdy forest cat with a long, snow-proof coat.' },
    pattern: 'tabby',
    colors: [
      C('Gris et blanc', 'Grey and white', 0x9a958d, 0x4b4741, { white: 'bicolor', eye: GREEN }),
      C('Brun tigré', 'Brown tabby', 0x8c6a46, 0x2e2117, { pattern: 'classic', eye: GOLD }),
      C('Roux et blanc', 'Red and white', 0xd28642, 0x9a521f, { white: 'bicolor', eye: GOLD }),
      C('Noir', 'Black', 0x191717, 0x191717, { pattern: 'solid', eye: GREEN }),
    ],
  },
  {
    id: 'scottish_fold', name: { fr: 'Scottish fold', en: 'Scottish fold' }, origin: 'angleterre', rarity: 3, scale: 1, fluff: 1.1, snout: 0.3, legs: 0.9, price: 210,
    earType: 'cat_fold',
    look: { hair: 'plush', head: 'round', build: 'cobby', eyes: 'round' },
    temper: ['cuddly', 'calm'],
    desc: { fr: 'Petites oreilles pliées vers l\'avant et tête toute ronde.', en: 'Little ears folded forward and a perfectly round head.' },
    pattern: 'solid',
    colors: [
      C('Bleu', 'Blue', 0x828a94, 0x828a94, { eye: COPPER }),
      C('Crème tigré', 'Cream tabby', 0xe6c49a, 0xc08a56, { pattern: 'classic', eye: COPPER }),
      C('Argenté tigré', 'Silver tabby', 0xc9cac8, 0x2b2b2e, { pattern: 'classic', eye: GREEN }),
      C('Bleu et blanc', 'Blue and white', 0x828a94, 0x828a94, { white: 'bicolor', eye: GOLD }),
    ],
  },
  {
    id: 'abyssin', name: { fr: 'Abyssin', en: 'Abyssinian' }, origin: null, rarity: 2, scale: 0.92, legs: 1.08, price: 170,
    earType: 'cat_big',
    look: { hair: 'short', head: 'modwedge', build: 'foreign', eyes: 'almond' },
    temper: ['playful', 'curious'],
    desc: { fr: 'Poil « agouti » : chaque poil est rayé. Un vrai petit puma curieux.', en: 'Ticked coat where every hair is banded. A curious little puma.' },
    pattern: 'ticked',
    colors: [
      C('Lièvre', 'Ruddy', 0xb7733e, 0x3b2416, { eye: GOLD }),
      C('Roux', 'Sorrel', 0xd08b55, 0x7a4020, { eye: GREEN }),
      C('Bleu', 'Blue', 0xa29891, 0x4f5560, { eye: GOLD }),
      C('Faon', 'Fawn', 0xd9b791, 0x9a7a5c, { eye: GREEN }),
    ],
  },
  {
    id: 'devon_rex', name: { fr: 'Devon rex', en: 'Devon rex' }, origin: 'angleterre', rarity: 3, scale: 0.86, legs: 1.05, snout: 0.6, price: 200,
    earType: 'cat_big',
    look: { hair: 'curly', head: 'pixie', build: 'foreign', eyes: 'oval' },
    temper: ['playful', 'cuddly'],
    desc: { fr: 'Poil court et frisé, immenses oreilles : un petit lutin farceur.', en: 'Short curly coat and enormous ears: a cheeky little pixie.' },
    pattern: 'solid',
    colors: [
      C('Crème', 'Cream', 0xeedcc0, 0xeedcc0, { eye: GOLD }),
      C('Noir et blanc', 'Black and white', 0x1c1a1a, 0xf2efe9, { pattern: 'bicolor', eye: GOLD }),
      C('Bleu', 'Blue', 0x8c94a0, 0x8c94a0, { eye: GREEN }),
      C('Roux tigré', 'Red tabby', 0xd8924e, 0xa55a26, { pattern: 'tabby', eye: GOLD }),
    ],
  },
  {
    id: 'bobtail', name: { fr: 'Bobtail japonais', en: 'Japanese bobtail' }, origin: 'japon', rarity: 3, scale: 0.95, tailType: 'stub', price: 180,
    earType: 'cat_big',
    look: { hair: 'short', head: 'modwedge', build: 'foreign', eyes: 'oval' },
    temper: ['playful', 'curious'],
    desc: { fr: 'Queue courte en pompon, porte-bonheur au Japon.', en: 'Short pom-pom tail, a lucky charm in Japan.' },
    pattern: 'tricolor',
    colors: [
      C('Mi-ke', 'Mi-ke', 0xf5f2ec, 0xd3893f, { third: 0x1e1a18, eye: GOLD }),
      C('Blanc', 'White', 0xf6f4ef, 0xf6f4ef, { pattern: 'solid', eye: BLUE, eye2: GOLD }),
      C('Noir et blanc', 'Black and white', 0x1b1818, 0xf3f0ea, { pattern: 'bicolor', eye: GOLD }),
    ],
  },
];

/** Poil déduit d'un ancien « look » (avant les champs propres aux chats). */
function hairFromFluff(fluff = 1) {
  if (fluff >= 1.28) return 'long';
  if (fluff >= 1.17) return 'semi';
  if (fluff > 1.05) return 'plush';
  return 'short';
}

// Œil « par défaut » que resolveLook donnait avant les races détaillées : presque noir avec le nouvel
// œil (l'iris remplit tout), il est remplacé par la couleur de la robe (ou doré).
export const OLD_DEFAULT_EYE = 0x2a1a10;
const realEye = (c) => (c == null || c === OLD_DEFAULT_EYE ? null : c);
// Proportions du modèle de l'espèce recopiées dans chaque look (voir resolveLook).
const MODEL_KEYS = ['bodyLen', 'bodyR', 'legLen', 'legR', 'neckLen', 'neckAngle', 'headLen', 'headR'];

/**
 * Chat d'une ancienne sauvegarde (look sans « hair ») : complète son look depuis sa race, dont l'id
 * est enregistré dans l'animal (poil, tête, silhouette, yeux, oreilles, taches blanches, yeux vairons)
 * et reprend les proportions actuelles du modèle (model = SPECIES.cat.model). Sa robe ne change pas.
 * Renvoie true si le look a été modifié (appelé par profile.migrate).
 */
export function upgradeCatLook(look, breed, model = null) {
  if (!look || !breed || look.hair) return false;
  const color = breed.colors.find((c) => c.name.fr === look.colorName?.fr)
    ?? breed.colors.find((c) => c.coat === look.coat && c.secondary === look.secondary) ?? null;
  Object.assign(look, breed.look);
  if (breed.earType && (!look.earType || look.earType === 'cat')) look.earType = breed.earType;
  if (color?.white && !look.white) look.white = color.white;
  if (color?.eye2 && look.eye2 == null) look.eye2 = color.eye2;
  if (!realEye(look.eye)) look.eye = color?.eye ?? GOLD;
  if (model) for (const k of MODEL_KEYS) if (model[k] != null) look[k] = model[k];
  return true;
}

/**
 * Traits d'apparence complets d'un chat, même pour un animal créé avant ces champs :
 * ce qui manque vient de la race (breed, si on la connaît) ou est déduit du look.
 */
export function catTraits(look = {}, breed = null) {
  const b = breed?.look ?? {};
  const snout = look.snout ?? 0.35;
  const hair = look.hair ?? b.hair ?? hairFromFluff(look.fluff);
  const head = look.head ?? b.head ?? (snout <= 0.18 ? 'flat' : snout <= 0.28 ? 'round' : snout >= 1 ? 'wedge' : 'balanced');
  const earType = (look.earType === 'cat' || !look.earType) && breed?.earType ? breed.earType : (look.earType ?? 'cat');
  let pattern = look.pattern ?? 'solid';
  if (!CAT_PATTERNS.includes(pattern)) pattern = pattern === 'patches' ? 'tricolor' : pattern === 'spots' ? 'rosettes' : 'solid';
  return {
    hair: CAT_HAIR.includes(hair) ? hair : 'short',
    head: CAT_HEADS.includes(head) ? head : 'balanced',
    build: look.build ?? b.build ?? (hair === 'long' || hair === 'plush' ? 'cobby' : 'semi'),
    eyes: look.eyes ?? b.eyes ?? (head === 'wedge' ? 'almond' : 'round'),
    earType: CAT_EARS.includes(earType) ? earType : 'cat',
    pattern,
    white: CAT_WHITE.includes(look.white) ? look.white : null,
    eye: realEye(look.eye) ?? GOLD,
    eye2: realEye(look.eye2) ?? realEye(look.eye) ?? GOLD,
    stubTail: look.tailType === 'stub',
  };
}

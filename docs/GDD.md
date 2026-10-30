# La ferme à Madichelle — Document de conception (GDD)

> Jeu gratuit, **sans réseau**, en 3D semi-réaliste : adopter des animaux, s'en
> occuper comme dans la vraie vie, et voyager avec eux (même à cheval jusqu'à
> l'étranger).

## 1. Cadre général

| Sujet | Décision |
|---|---|
| Plateformes | Téléphone **et** ordinateur (jeu web installable, PWA, 100 % hors ligne) |
| Public | Enfants et ados |
| Diffusion | D'abord en interne, publication possible plus tard |
| Langues | Français (principal), anglais (secondaire) |
| Contrôles | Tactile (joystick virtuel + boutons) **et** clavier/souris |
| Style 3D | Semi-réaliste (joli mais simplifié) |
| Caméra | Au choix : 3ᵉ personne ou 1ʳᵉ personne |
| Sauvegarde | Plusieurs profils, stockés sur l'appareil |

## 2. Avatar
- Création à la première partie : prénom, couleur de peau, cheveux, tenue.
- Modifiable à tout moment depuis le menu.

## 3. Animaux

### Espèces
Toutes les espèces sont prévues, ajoutées progressivement :
- **Version 0.1** : cheval, chien, chat, lapin.
- **Version 0.3** : mouton, chèvre, vache (laine, lait, chiens de troupeau).
- **Ensuite** : poney, âne, cochon d'Inde, hamster, oiseaux, poules, tortue,
  perroquet, furet, etc.

### Races
Plusieurs races par espèce, chacune avec sa taille, ses couleurs de robe et ses
traits (ex. *Labrador*, *Berger allemand*, *Frison*, *Maine Coon*…).

### Nombre
Illimité.

### Cycle de vie
- Les animaux naissent bébés, grandissent, vieillissent et peuvent **mourir de
  vieillesse** (la durée de vie dépend de l'espèce).
- **Reproduction** possible entre deux adultes de même espèce et de sexes
  opposés : les petits héritent d'un mélange de races et de couleurs.
- Le temps ne passe **que pendant qu'on joue** (pas d'effet Tamagotchi).
- Échelle : 1 jour de jeu = 30 minutes réelles en vitesse normale (1 h en lente, 10 min en rapide, réglable) ; 1 an d'animal = 12 jours de jeu.

### Personnalité
Chaque animal a un caractère : *joueur, timide, câlin, têtu, curieux, calme*.
Il change sa façon de réagir (vitesse de baisse du bonheur, envie de jouer,
réussite au dressage…).

### Le cheval vivant (0.5, `src/game/AnimalEntity.js` horseLife)
- **Il t'accueille** : quand tu reviens après être resté loin (40 s à plus de 16 m), ton cheval hennit doucement,
  lève la tête et te regarde ; s'il t'aime bien (lien ≥ 25), il vient vers toi jusqu'au bord de son pré ou de son
  paddock (💕 si le lien est fort ; 🌾 et « c'est l'heure du foin ! » s'il a faim). Une fois par retour.
- **Il se roule** : au pré ou au paddock (jamais au box), sans selle sur le dos (on la lui enlève d'abord), il se couche, se roule deux fois sur le flanc en
  gigotant, se relève et s'ébroue. Tout de suite après une balade où il a galopé, souvent quand il a transpiré,
  sinon de temps en temps ; ensuite il est un peu moins propre (pansage −6) et content. Monté pendant une
  roulade, il se relève d'abord. Au pansage suivant, il a deux plaques de terre de plus (« il s'est roulé »).
- **Les mouches** : coups de queue et d'oreilles par moments (déjà là, `horseReal.js`).
- **Il dort couché, parfois** : la nuit, une fois sur deux environ, il se couche sur le sternum pour dormir, et de
  temps en temps s'allonge un moment sur le flanc (le sommeil profond) ; il se relève au réveil.
- **Sous la pluie** (ou la neige), au pré : il bouge peu et tourne la croupe au vent (le vent change chaque jour).
- **Le gourmand** (`src/sim/riding.js` nextGrazeIn) : en balade au pas sur l'herbe, il finit par baisser la tête
  pour brouter et s'arrête (plus vite s'il a faim ou s'il est têtu, moins s'il est calme et bien dressé). On
  raccourcit les rênes : une allure, ou avancer un moment, et il repart.
- **Ses pieds** (`src/sim/animal.js` HOOF) : chaque jour, de la terre se tasse dans ses sabots (plus vite sous la
  pluie). Pas curés pendant trois jours environ, un caillou s'y coince et il **boite** (🩹 au-dessus de lui, il
  marche doucement, on ne le monte plus, ni longe ni liberté : il se repose ; un message le dit). Le cure-pied du pansage enlève la terre ; le caillou est
  dans le pied qui boite (la consigne le nomme) : l'enlever, et il ne boite plus. Le vétérinaire aussi. Laissé deux
  jours, le caillou fait un abcès : il est malade (sa fiche dit « Blessé », 🩹 ; vétérinaire). Les soins sans mini-jeu (pour tous les chevaux, les
  aides) curent les pieds aussi.

## 4. Besoins (« comme dans la vraie vie »)

| Besoin | Comment le remplir |
|---|---|
| Faim | Nourrir (croquettes, foin, carottes…) |
| Soif | Donner à boire |
| Propreté | Laver, brosser, nettoyer la litière ou le box |
| Énergie | Laisser dormir et se reposer |
| Exercice | Promener, jouer, monter, entraîner |
| Affection | Caresser, câliner, parler |
| Toilettage | Brosser, couper les griffes, ferrer (chevaux) |
| Santé | Découle des autres besoins, et des soins chez le vétérinaire |
| Bonheur | Moyenne pondérée de tout le reste |

**Seller et desseller** (0.5, `src/ui/minigames/seller.js`) : le premier cheval arrive avec son licol ; sa selle et
son filet offerts l'attendent à la sellerie (son premier « 🏇 Seller et monter » apprend à seller, puis à brider).
« 🧰 Desseller » range
la selle et le tapis à la sellerie (après le galop, le jeu le rappelle : sans selle, au pré, le cheval va se rouler).
Un poulain trop jeune pour être monté : ni selle, ni tapis, ni filet (son menu, sa fiche, « Équiper » à la sellerie ; ce qu'il porte s'enlève toujours).
Pas de selle sur le dos : « 🏇 Seller et monter » (ou « 🪢 Seller » seul, ou « 🐎 Monter à cru »). Le mini-jeu, en
trois étapes « juste ce qu'il faut » : ① le tapis glissé sur le dos, juste derrière le garrot (trop en avant, il
gêne les épaules ; trop en arrière, il appuie sur les reins) ; ② la selle posée sur le tapis, au même endroit ;
③ la sangle serrée en deux fois en gardant le doigt sur 🪢 Serrer : la première fois, le cheval gonfle le ventre et
la sangle se relâche, on resserre ensuite ; trop serrée, il couche les oreilles. On remet la même selle qu'avant.

**Brider et débrider** (0.5, `src/ui/minigames/bridle.js`) : le filet ne reste jamais au box ni au pré (il pourrait
s'y accrocher). « 🧰 Desseller » range la selle, le tapis et le filet ; le cheval garde (ou retrouve) son licol. Un
cheval rentré au box ou lâché au pré est débridé (la première fois : « On enlève toujours le filet au box et au
pré. ») ; monté à cru avec le filet, « 🧰 Débrider » dans son menu ; les anciennes sauvegardes sont débridées au
chargement. Dans « 🏇 Seller et monter », après la selle (comme au club, le filet en dernier), la tête en gros plan :
① le mors : il serre les dents ; on touche le coin de ses lèvres, là où il n'a pas de dents (la barre), il ouvre la
bouche (devant ses dents, il relève la tête) ; ② les oreilles : une, puis l'autre, pour passer la têtière derrière ;
③ la sous-gorge, en gardant le doigt sur 🪢 Serrer : un poing de place (trop serrée, ça le gêne pour respirer, il
couche les oreilles). « Filet bien mis ! On bride toujours par la gauche. » Après trois filets mis, « ⏩ Brider
vite ». Fermé avec ✕ : il reste sellé, sans filet. « 🏇 Monter » met toujours le filet libre (le même qu'avant, dans
sa couleur), même par-dessus le licol ; sans filet libre, on monte au licol.

**Le pansage du cheval** (0.5, `src/ui/minigames/pansage.js`) : brosser un cheval, c'est « Panser », comme au
club, avec les quatre outils dans l'ordre. ① L'étrille : des petits ronds sur la boue sèche pour la décoller (des
traits droits la décollent mal), jamais sur la tête ni sur les jambes (le cheval couche les oreilles). ② La brosse :
chasser la poussière décollée dans le sens du poil. ③ Le cure-pied : les quatre pieds l'un après l'autre (antérieur
gauche, postérieur gauche, antérieur droit, postérieur droit), du talon vers la pince le long de la fourchette, sans
piquer la fourchette ; parfois un caillou coincé. ④ Le peigne : démêler les nœuds de la crinière et de la queue, de
haut en bas. Chaque étape a sa zone « juste ce qu'il faut » ; la note est la moyenne des quatre, et le message de
fin parle de l'étape la moins bien faite. Plus le cheval est sale (après un galop), plus il y a de boue et de nœuds.

### Négligence
1. Un animal négligé devient **triste** (animation, il boude, il obéit moins).
2. Si ça continue, il **tombe malade** : il faut l'emmener chez le **vétérinaire**.
3. Pas d'abandon ni de mort par négligence (seulement de vieillesse).

### Les étapes du lien (0.5, `src/sim/animal.js` BOND_STAGES)
Le lien ❤️ avec chaque animal a quatre étapes, écrites dans sa fiche : « Vous faites connaissance » (0), « Il te fait
confiance » (25), « Il t'adore » (50), « Vous êtes les meilleurs amis du monde » (75). Passer une étape : un petit mot
et des 💞. Avec un cheval, chaque étape débloque quelque chose (BOND_PERKS, listé dans sa fiche : ✅ ce qui est là,
🔒 la prochaine étape) : en confiance (25), il s'effraie moins en balade ; il t'adore (50), il vient toujours à ton
appel ; meilleurs amis (75), il te suit en liberté, même sans licol (un concours de présentation ou le van demandent
quand même le licol).

### « 💡 Le savais-tu ? » (0.5, `src/sim/horseFacts.js`)
À la fin de chaque mini-jeu fait avec un cheval, un fait vrai sur les chevaux (27, qui défilent sans se répéter) :
il boit 30 à 50 litres par jour, il dort debout, on monte par la gauche, la fourchette aide le sang à remonter…

**🃏 Mes cartes** : chaque fait est une carte à collectionner, et chaque soin cache les siennes (l'eau : ce qu'il
boit ; le vermifuge : ses dents, la dose ; la longe : les allures, la détente, le retour au calme…). Le mini-jeu
montre d'abord une carte pas encore trouvée de ce soin, puis une carte « de tous les soins » (son âge, le poulain,
le flot du concours). Une nouvelle carte se retourne sur la carte de fin (« ✨ Nouvelle carte ! 9/27 ») ; elle ne se
gagne qu'en finissant (fermé avec ✕ : la même revient la fois suivante). À la 9e et à la 18e, 30 🪙 (en gestion) ;
à la 27e, « tu es un vrai expert ! ». « 🃏 Mes cartes 9/27 » (panneau des Galops et fiche du cheval) ouvre l'album :
les cartes trouvées (un toucher lit le fait en entier), et pour les autres ❓ et l'icône du soin où chercher (⭐ :
n'importe lequel). Le carnet du cavalier les compte.

### La journée de ton cheval (0.5, `src/sim/horseDay.js`)
La routine d'un vrai propriétaire, chaque jour de jeu, dans sa fiche (« ☀️ Sa journée ») : 🌅 foin du matin (avant
14 h), 🌇 foin du soir (dès 14 h), 💧 eau fraîche, 🪮 pansage, 🏇 le faire travailler (monter, longe, liberté, une
activité) et ❤️ un câlin ; un poulain trop jeune pour être monté, ou une jument pleine, n'a pas de 🏇. Tout coché :
« 🌟 Journée parfaite » (lien +3, affection +10, de l'XP). Quête du thème « 🐴 Ton cheval » : trois journées parfaites.
« 🫧 Il te demande… » (`src/sim/horseWish.js`, `src/game/wishBubble.js`) : à 10 m de ton cheval, une petite bulle
blanche flotte au-dessus de sa tête, sous son nom, avec une seule icône, la prochaine chose de sa journée : 🌾 (il a
faim, ou le foin du matin manque avant 14 h), 💧, 🪮, 🏇 (de 8 h à 19 h, s'il peut être monté), 🌾 le foin du soir
(dès 14 h, après le travail : sa ration en dépend), puis ❤️. Le soin fait, la bulle éclate en ✨ et la suivante vient
une seconde après ; tout fait, plus de bulle.
Malade, boiteux ou endormi, son 🤒, son 🩹 ou son 💤 passent avant ; triste, il montre sa bulle plutôt que 😢 (c'est
comme ça qu'on le console). Pas la nuit (21 h-6 h), ni sur son dos, ni pendant une activité ou un voyage, ni pour un cheval confié,
ni pendant le tutoriel. À l'écurie, chacun montre la sienne. Son nom ou sa bulle sous une pastille d'état (« 🧭 Des
visiteurs t'attendent »…) ou sous le suivi de quête : ils pâlissent et laissent le doigt toucher le nom à travers.
« Sa bulle, son bouton » : toucher la bulle te fait marcher jusqu'à lui, puis fait ce qu'il demande : le mini-jeu du
soin (🌾 la ration, 💧, 🪮 le pansage, ❤️), 🏇 « Seller et monter » (ou monter, s'il est déjà sellé), ou 🧰 desseller.
Près de lui, le bouton vert le dit (« 🌾 Pomme a faim » et « 💧 Pomme a soif » sous 45, sinon sa routine : « 🌾 Le foin du matin de Pomme », « 🌾 Le foin du soir de Pomme », « 💧 De l'eau fraîche pour Pomme » ; « 🪮 Panse Pomme », « 🏇 Monte Pomme »,
« ❤️ Un câlin pour Pomme », « 🧰 Desselle Pomme », ou « Débride Pomme » s'il n'a que son filet) et E le fait ; dans son menu, ce qu'il demande vient en premier, cerclé d'or. Son nom
ouvre toujours son menu : une quête qui veut autre chose (« caresse-le » quand il a faim) le montre du doigt, pas le
bouton vert. Nourrir un cheval, c'est 🌾 (son menu, sa fiche, le tutoriel, les quêtes, sa barre de faim, ce qui monte au-dessus de lui). Après le travail, descendu encore sellé ou bridé : 🧰 avant le reste
(même s'il a faim : on le desselle avant de le nourrir ; pas pour une selle qu'on vient de lui remettre et qui n'a pas encore servi) ; un toucher range la selle et le filet à la sellerie, ✨, puis
la suite. En sueur, il se panse même tout propre.

### Le défi du jour (0.5, `src/sim/horseChallenge.js`)
Chaque jour de jeu, un petit défi avec ton cheval, tiré parmi ceux que tu sais déjà faire : le caresser 3 fois, le
panser, 2 friandises, le monter 2 fois, galoper, qu'il vienne à ton appel, trotter enlevé (8 de suite), sauter 2
troncs, une journée parfaite, monter avec un ensemble assorti. Annoncé par un petit mot, affiché dans « ☀️ Sa journée » (où tu en es), compté depuis le
début du jour. Réussi : 30 🪙 (en gestion) et un peu de lien (+2) au cheval monté (sinon au dernier dont tu t'es
occupé) ; jamais le même défi deux jours de suite. Jamais un défi impossible aujourd'hui : pas de défi à cheval si
aucun de tes chevaux ne peut être monté (il boite, il est malade…), pas de troncs loin de la ferme, pas de journée
parfaite tirée l'après-midi (le foin du matin est passé).

### Le carnet de santé du cheval (0.5, `src/sim/horseHealth.js`)
Comme pour un vrai cheval, mais raccourci dans le temps du jeu (le carnet donne aussi les vrais rythmes : vermifuge 2
à 4 fois par an après une analyse de crottin, vaccins et dents une fois par an, maréchal-ferrant toutes les 6 à 8
semaines) : 🪱 vermifuge tous les 20 jours (bouton dans sa fiche,
12 🪙), 💉 vaccins et 🦷 dents tous les 60 jours (contrôlés à chaque visite chez le vétérinaire), 🔨 maréchal-ferrant
tous les 14 jours (« Ferrer »). Dans sa fiche, « 📒 Carnet de santé » dit pour chaque soin s'il est à jour, pour
quand, ou en retard. Le jour venu, un rappel. En retard : sans vermifuge il maigrit et perd de la santé, les dents
mal contrôlées le font maigrir (il mâche mal), sans vaccin il attrape plus facilement la grippe, et des fers usés
depuis 3 jours finissent par tomber (il boite : on le ferre). Bien suivi : rien de tout ça.
Le vermifuge est un mini-jeu (`src/ui/minigames/deworm.js`) : on règle la bague de la seringue sur son poids
(environ 250 kg pour un poney, 500 pour un cheval, 750 pour un cheval de trait, selon qu'il est maigre ou rond) : son
poids ou un peu plus (on arrondit au-dessus, jusqu'à 75 kg de plus), jamais moins (ça marche mal et les vers
s'habituent au produit) ; puis on glisse la seringue dans le coin de sa bouche (là où il n'a pas de dents) et on pousse
toute la pâte. Raté (moins de 2 étoiles) : ça ne compte pas, on recommence (la pâte n'est pas payée).

### Les soins se voient sur sa robe (0.5, `src/game/models/horseCoat.js`, AnimalEntity.coatCare)
Il s'est roulé, ou il n'a pas été pansé depuis longtemps (pansage sous 55) : de la terre sur les jambes et des taches
brunes sur le corps (plus il est sale, plus il y en a) ; le pansage les enlève. Bien pansé (85 et plus), sa robe est
plus satinée ; crotté, elle est terne. Après un galop (ou un long trot), il transpire : son poil mouillé fonce par
plaques (la sueur monte avec l'effort ; en balade libre, elle sèche un peu au pas, sinon en une heure de jeu environ ;
le pansage ou la douche l'enlèvent).
Sous la pluie, dehors et sans couverture imperméable, il est mouillé de la même façon ; au box ou couvert, il reste sec.
🧦 **Chaussettes de boue** (`src/sim/legMud.js`) : au pré, à la saison des pluies du lieu (poids de pluie de 3 et plus :
en Normandie, tout sauf l'été), ou partout quand il pleut, la boue monte sur ses jambes
jusqu'aux genoux en deux heures de jeu environ : foncée mouillée, claire et poussiéreuse en séchant (elle tombe peu à
peu au sec). Au box, il reste propre. Sur un gris ou un blanc, ça se voit le plus, comme en vrai. Au pansage, la brosse
trouve quatre taches sur ses jambes (foncées mouillées, claires sèches, comme en 3D) ; sa consigne ajoute « 🧦 Ses jambes : de haut en bas ↓. » (le poil des
jambes pousse vers le bas ; l'étrille sur les jambes fait toujours mal). Ses jambes propres, la première fois, un
conseil en message après le pansage (9 s) : « 🧦 Quand le pré est boueux, on laisse sécher la boue au box, puis on brosse. Mouiller ses jambes tous les jours abîme sa peau. »
Tant qu'il en a, le pansage n'est jamais « inutile ».

### Ses oreilles (0.5, `src/sim/horseEars.js`)
Les oreilles du cheval 3D disent comment il va, comme en vrai : en avant (attentif, curieux ; quand tu t'approches,
il les pointe vers toi ; s'il a faim ou soif, il te guette en attendant son foin), sur le côté (il somnole, il est
fatigué), couchées en arrière (il a mal, ou il est grognon). Sa fiche le dit aussi : « 👂 Oreilles en avant : Étoile a
faim : elle te guette… ». (Question du Galop 1.)

### Ses étoiles (0.5, `src/sim/horseStars.js`)
Dans sa fiche, sous la ligne des oreilles : 🏃 vitesse, 💪 endurance, ⤴️ saut, 🎩 dressage, 👂 obéissance, de 0 à 5
étoiles chacune (paliers 20, 40, 65, 85 et 100 ; les trois premiers sont ceux des parcours de saut). Toucher un groupe
dit ce qui manque (« ⤴️ Saut : encore 6 points pour l'étoile suivante. Saute des troncs, prends des leçons. » ; un
poulain : « trop jeune pour être monté », sauf l'obéissance : « Un peu de travail en liberté, tout en douceur. »). Une
étoile de plus, d'où qu'elle vienne (tronc sauté, leçon, longe, entraînement, longue balade) : des ⭐ s'envolent du
cheval, deux notes et un petit mot, un à la fois (« ⭐ Saut : Étoile a sa première étoile ! Elle ne pile plus devant
les troncs. » : vrai, à 20 en saut le refus devant un tronc tombe à 0 ; la 2e ouvre le parcours du club, la 3e le grand).
La première fois, une vieille partie note ses étoiles sans rien dire ; une étoile n'est fêtée qu'une fois. Seulement
tes chevaux.

Elles se sentent en selle (`STAR_FX`). 💪 Chaque étoile d'endurance : l'effort lui coûte 8 % de moins (à 5 étoiles, le
galop 40 % de moins : il galope bien plus longtemps avant « il ne veut plus galoper », en balade comme en voyage) et
il récupère 10 % plus vite au pas. 🎠 Chaque étoile de dressage : il prend l'allure demandée 12 % plus vite (il
accélère et s'arrête plus tôt). 🏃 La vitesse le faisait déjà galoper plus vite jusqu'à 2 étoiles ; au-delà, chaque
étoile lève le plafond de son grand galop (de 1,3 à 1,45 × : le chrono du cross aussi). 🎓 L'obéissance espaçait déjà
ses écarts et ses arrêts pour brouter. Le petit mot le dit (« ⭐ Endurance : Étoile a maintenant 2 étoiles ! Elle
galope plus longtemps et récupère plus vite au pas. »), et dans sa fiche, un groupe touché qui a au moins une étoile
ajoute « ✅ » et ce qu'elle change. Rien pour un poulain qui ne se monte pas encore.

### La ration du cheval (0.5, `src/ui/minigames/ration.js`)
« Nourrir » le cheval est un mini-jeu en deux temps, comme en vrai : d'abord bien remplir son filet à foin (il mange
du foin presque toute la journée : au moins 75 %), puis une petite mesure de granulés dans le seau (la zone verte,
15 à 30 % du seau). Trop de granulés (55 % et plus) : le jeu prévient, la note est basse, et une fois sur deux il a
mal au ventre (les coliques : malade, « ventre », le vétérinaire le soigne). La ration suit le travail, comme en
vrai : le soir (dès 14 h) d'un jour où il n'a pas travaillé (« 🏇 » pas coché dans sa journée), presque que du foin
(3 à 14 % du seau en granulés) ; le jeu l'explique.

### Sauter en balade (0.5, `src/sim/freeJumps.js`, `src/game/FreeJumps.js`)
À la ferme, quatre troncs couchés en travers du chemin de balade (un tronçon sur deux), chacun avec un piquet numéroté
(l'ordre du cross). Le premier galop à la ferme, un petit mot dit où ils sont ; les quêtes « 3 troncs » et « cross »
font d'abord passer au galop, puis la flèche jaune montre un tronc (le n° 1 pour le cross). Au galop (c'est l'allure qui compte :
un poney au galop saute, un cheval de trait au trot enjambe), bien droit, à moins de 12 m : un bouton orange
« ⤴️ Sauter » (Espace). Appel entre 3,6 et 0,4 m du tronc, idéal à 1,8 m : un beau saut (⭐) ; trop tôt, le jeu le
dit (« le tronc est à 6 m ») ; rien touché, lancé au galop, il saute tout seul au dernier moment (moins bien). Au
trot, il l'enjambe d'un petit bond ; au pas, il passe tranquillement. Pendant une activité ou une balade guidée, les troncs sont rangés.
Le saut reprend celui des séances d'obstacles (bascule, membres repliés, cavalier en suspension) ; chaque saut
entraîne un peu le cheval (+0,2 à +0,4 en saut). Ils se sautent dans les deux sens.
Un cheval pas encore habitué à sauter (compétence de saut sous 20) pile parfois devant le tronc (≈ 24 % à 10, deux
fois moins bien appelé) : il s'arrête net et recule ; les leçons de saut et les troncs sautés l'habituent.
⏱️ **Le cross** : sauter le premier tronc lance le chrono ; la flèche jaune montre le suivant, dans l'ordre du chemin ;
le dernier sauté, c'est fini (temps, record gardé, « Cross terminés » et « Record du cross » dans le carnet du
cavalier). Un tronc hors de l'ordre ne compte pas (le jeu le dit ; sauter un autre tronc que le n° 1 sans cross en
cours explique comment le lancer) ; descendre de cheval, une activité, un voyage ou plus de 5 minutes : arrêté
(aller quelque part en touchant le sol, à cheval, ne l'arrête pas).

### Le trot enlevé (0.5, `src/sim/posting.js`)
À cheval en balade libre, en selle (avec des étriers), au trot : un gros bouton rond « ⬆️ Debout » (Espace au clavier ; au club, on apprend « debout, assis »).
Un cercle se referme sur lui à chaque foulée ; on touche quand il se referme (le sabot tape), à 20 % de foulée près,
une fois par foulée. Trois bons temps de suite : le cavalier se lève et se rassoit en rythme (trot enlevé), et le trot
fatigue deux fois moins le cheval ; sans toucher (1,6 foulée), on retombe assis (on rebondit dans la selle). Huit
de suite : bravo (pratique du Galop 2). La première fois, un petit mot explique comment faire. À cru (sans selle, donc
sans étriers), on trotte assis : le jeu le dit une fois.

### La détente et le retour au calme (0.5, `src/sim/warmup.js`)
Comme au club, en balade libre : on commence au pas (20 secondes de jeu : ses muscles s'échauffent) avant de trotter ;
trotter ou galoper tout de suite, le jeu le dit gentiment (les trois premières fois) et l'effort le fatigue un peu plus
(×1,25 au trot et au galop) ; bien échauffé, un petit « ✅ ». À la fin, après au moins 4 secondes de galop, on finit au
pas (15 secondes) avant de descendre : « 😌 Retour au calme » (lien +0,5, affection +6, il a séché un peu en marchant,
« Retours au calme au pas » dans le carnet du cavalier) ; descendu juste après le galop, le jeu dit qu'il est encore
essoufflé. Pas pendant une activité ni un voyage (ils mènent le cheval) ; encore en selle après, il a travaillé : échauffé, sans petit mot.

### Ta balade (0.5, `src/sim/rideLog.js`, `src/ui/rideCard.js`)
En descendant d'une balade libre d'au moins 40 secondes en mouvement (avec un de tes chevaux, après le tutoriel), une
petite carte reste 12 secondes à l'écran (cachée sous une fenêtre ou un mini-jeu, ce temps ne compte pas ; un toucher la ferme ; remonté en selle ou au début d'une activité, elle s'en va) : « 🏇 Belle balade avec Pomme ! », le temps et la distance
(« ⏱️ 6 min · 📏 1,4 km » ; au pas, 1,6 m/s, environ 6 km/h comme un vrai cheval), une barre des allures (🐢 pas, 🐴
trot, 💨 galop), au plus 3 lignes de ce qui s'est passé (troncs sautés, cross fini, fer porte-bonheur, citrouilles,
8 « Debout » de suite ou plus), les tampons « ✅ Détente » (pas s'il était déjà chaud) et « ✅ Retour au calme », les
deux : « 🏅 Comme au club ! » (ou « 😮‍💨 Finis au pas, la prochaine fois »), l'étoile de la compétence qui a le plus
grandi (« 💪 Encore 2 points pour sa 2e étoile », avec sa barre), « 📏 Sa plus longue balade ! » (dès 200 m ; la
première balade mesurée est notée sans rien dire), ce qui manque à sa journée parfaite (« 🌇 ❤️ », rien si le foin du
matin est oublié) et, sellé après un galop, « 🧰 Desselle-le : il veut se rouler ». Elle remplace alors les petits mots
du retour au calme et de « Desseller » (le lien du retour au calme est toujours donné). Pas de carte pour une balade
plus courte, menée par une activité ou un voyage, ni en passant d'un cheval à l'autre en selle : les petits mots d'avant (encore en selle après une activité ou un voyage, la balade libre qui suit a sa carte). Seul le chemin vraiment fait compte
(il galope sur place contre une barrière : rien) ; quand il va tout seul où on a touché, son allure se lit à sa
vitesse. Téléphone en paysage : plus serrée, toujours au-dessus du bouton vert ; sa journée parfaite s'efface et 🧰 passe avant l'étoile.

### Son souffle dans le froid (0.5, `src/sim/breath.js`, `src/game/HorseBreath.js`)
Quand il fait froid (10 °C et moins, un peu plus visible sous la pluie, la neige ou le brouillard), on voit la buée de
son souffle : deux petites bouffées blanches sortent de ses naseaux, vers le bas et l'avant, à chaque expiration (un
cheval respire seulement par le nez). Au repos, une toutes les 5 secondes (12 respirations par minute, moins en
dormant, au box aussi : l'écurie n'est pas chauffée) ; juste après un galop, presque une par seconde, puis de moins
en moins pendant le retour au calme au pas. Un cheval en sueur (30 secondes de galop suffisent) fume un peu du dos,
de moins en moins en séchant, encore un instant après qu'on est descendu. La
première fois, tout près : « 🌬️ Il fait froid : regarde la buée quand Étoile souffle ! ». Les 3 chevaux les plus
proches de la caméra seulement (à 15 m), 24 bouffées au plus.

### Appeler ton cheval (0.5, `src/sim/horseCall.js`)
« 📣 Appeler » (menu du cheval) : de loin, il lève la tête et hennit. S'il te fait assez confiance, il vient vers toi au
trot et s'arrête près de toi, tout content (le lien grandit un peu, trois fois par jour au plus) ; sinon il te regarde
et reste là. Chance qu'il vienne : 15 % + lien / 60 (+ 20 % s'il a faim : il espère du foin) ; lien 51 et plus : il
vient toujours. Il ne vient pas s'il dort, s'il a mal (il boite, il est malade) ou s'il est au box (il hennit pour te
répondre). Trop près (moins de 5 m), pas besoin de l'appeler : le menu le dit (« éloigne-toi un peu d'abord »).
Rappeler pendant qu'il arrive ne compte pas deux fois ; pendant la pause, rien. Pratique du Galop 2.

### Les souvenirs de ton cheval (0.5, `src/sim/memories.js`)
Dans sa fiche, « 📸 Ses souvenirs » : vos premières fois, notées une seule fois avec le jour — son arrivée chez toi, la
première balade, le premier galop, le jour où il est venu à ton appel, la première journée parfaite, le premier tronc
sauté, le premier retour au calme, chaque Galop (avec le cheval du moment), le premier concours et le premier podium,
le premier cross, la chasse aux citrouilles, le premier ensemble assorti. Le tout premier souvenir est annoncé par un petit mot ; seulement pour tes
chevaux (pas ceux en pension).
Aussi les souvenirs du quotidien : chaque étape du lien (🤝 il te fait confiance, 💖 il t'adore, 🦮 meilleurs amis du
monde), la première balade sous la pluie (ou l'orage) et dans la neige, la première visite du vétérinaire, le premier
vermifuge (bien dosé : un sous-dosage ne compte pas), le premier voyage ensemble (à cheval, en van, en bateau ou en avion).
**🎂 Un an ensemble** : 12 jours de jeu après son arrivée (un an de jeu, comme pour l'âge), 🎂 au-dessus de lui, le
lien +2 et un petit mot avec un conseil vrai (« une carotte coupée en long, jamais en rondelles » : une rondelle peut
se coincer dans sa gorge) ; ce jour-là, sa première friandise lui fait encore plus plaisir (affection +15, une seule :
pas plus de sucre). La première année devient un souvenir, daté de son vrai jour même fêté en retard ; les suivantes,
un petit mot (« 🎂 2 ans avec Étoile ! »). Un cheval sans souvenir d'arrivée (vieille partie, poulain né à la ferme)
compte à partir du premier jour où le jeu le trouve près de toi. Une étape du lien passée sans petit mot (un tour, une
balade guidée, un concours de beauté) devient un souvenir au soin suivant.
Ses **flots** de concours (or, argent, bronze pour le podium, puis vert, blanc, rose ; 6 au plus, les meilleurs
d'abord) sont accrochés sous la plaque à son nom, sur la porte de son box (src/sim/competitions.js rosettesOf).
**📸 De vraies photos** (src/sim/memories.js attachPhoto) : les grandes premières fois en selle (la première balade, le
premier galop, le premier tronc sauté, sous la pluie ou dans la neige, le jour où il vient à ton appel, le premier retour
au calme, le cross fini, la chasse aux citrouilles finie) prennent leur photo un instant après, si rien ne cache le jeu
(une fenêtre, comme « ⭐ Tu passes au niveau 2 ! » : la photo attend qu'on la ferme, 10 s au plus) et que le cheval se
voit bien (monté, ou à moins de 25 m dans l'écran ; photo cadrée sur lui) : 📸 au-dessus de lui. Dans sa fiche, la petite
photo remplace l'icône ; la toucher l'ouvre en grand, avec sa phrase et son jour. Les souvenirs des menus (Galops,
vétérinaire, vermifuge…) gardent leur icône. Au plus 6 photos par cheval et 18 dans la partie (192 × 120, en JPEG) ;
la sauvegarde garde toujours 25 % de marge sous la limite en ligne, sinon la photo n'est pas gardée.

### Ce que tu sais de lui (0.5, `src/sim/horseQuirks.js`)
Chaque cheval a ses goûts, toujours les mêmes (tirés de son id, rien à sauvegarder) : son **coin à gratouilles** (le
garrot 40 %, là où les chevaux se grattent l'un l'autre au pré ; l'encolure 25 %, le poitrail 20 %, le front 15 %), sa
**friandise préférée** (la carotte ou la pomme) et sa **peur en balade** (les oiseaux, les sacs plastique, son ombre,
les lapins). Dans sa fiche, « 🔍 Ce que tu sais de lui » : trois lignes en ❓ tant qu'on ne sait pas. En le caressant,
le 💡 du coin préféré attend 8 secondes (au lieu de 3,5) tant qu'on ne le connaît pas ; gratté juste là, il tend la
lèvre du haut. La friandise : deux boutons, 🥕 et 🍎 ; sa préférée, « Miam, sa préférée ! » et un 💖 (le nombre juste
ne change pas). En balade, 7 écarts sur 10 viennent de sa peur à lui : la deuxième fois, on a compris, puis le jeu
rappelle de lui parler doucement. Chaque découverte : un petit mot 🔍, un souvenir et lien +2. Seulement tes chevaux.

### « Bravo ! » et « Rassure-le » en selle (0.5, `src/sim/praise.js`)
En balade libre, un bouton rond rose « 🤚 Bravo ! » apparaît à la place de ⬆️ (jamais de ⤴️ ; Espace au clavier) : 3
secondes après un beau saut de tronc (⭐), 6 secondes quand le retour au calme au pas est fini ; « 🤚 Rassure-le » 4
secondes juste après un écart (pas en pleine série de trot enlevé : ⬆️ garde sa place). Touché : la main du cavalier
gratte le garrot (les chevaux se grattent là entre eux, au
pré : la première fois, un petit mot le dit), des 💕 montent (💖 si le garrot est son coin préféré, et qu'on le sait) ;
lien +0,3 et affection +3, au plus 3 fois par balade et 6 par jour, seulement tes chevaux. Rassuré après un écart, il se
calme et le prochain écart vient plus tard. Si c'était sa peur à lui (connue) : « 💪 Pomme a moins peur des oiseaux
(2/5) », et sa fiche dit « · 💪 2/5 » ; la cinquième fois, il n'en a plus peur (lien +3, un souvenir) : plus jamais
d'écart à cause d'elle, et un peu moins d'écarts en tout. Ne pas toucher ne coûte rien. « 🤚 Bravos en selle » dans le
carnet du cavalier.

### Tout assorti (0.5, `src/sim/matchy.js`)
Comme au poney-club, où l'on aime les ensembles de la même couleur : dans sa fiche, sous l'équipement, la ligne
« 🎨 Ensemble » a trois pastilles — le tapis, les jambes (guêtres ou cloches) et ta bombe —, vides tant qu'elles ne
sont pas de la couleur du tapis (le tapis citrouille ne compte pas), pleines et cerclées de vert sinon ; pas pour un
poulain trop jeune pour être monté. Un petit mot nomme la pièce qui manque
(« Il manque : Cloches (Rose) » : ce qui est déjà à toi d'abord, sinon la moins chère), avec un bouton : « Mettre »
si elle est à toi (on change seulement sa couleur ; un tapis mis sans selle reste quand on le selle), sinon sa fiche
à la sellerie, dans la bonne couleur. Tapis et
jambes assortis : « ✨ Assorti : Rose ! » et des étincelles sur le cheval ; ta bombe aussi : « 🌟 Tout assorti, même
ta bombe ! » (ta bombe compte pour tous tes chevaux d'ici : des étincelles sur chacun, le petit mot une fois).
Le premier ensemble est un souvenir ; ensuite, monter avec un ensemble fait quelques étincelles, et le
défi du jour peut devenir « 🎨 monte avec un ensemble assorti ». Jusqu'à la bombe : blanc, bleu marine, noir, rose,
bleu ciel, violet ; rouge sans la bombe (pas de bombe rouge) ; vert ou gris : pas de guêtres ni de cloches.

### Halloween au poney-club (0.5, `src/sim/halloween.js`, `src/game/Halloween.js`)
Comme dans les vrais clubs fin octobre, du 24 octobre au 2 novembre (date réelle) : des citrouilles-lanternes au départ
du chemin de balade (elles s'allument le soir), et la **chasse aux citrouilles** : 8 citrouilles posées au bord du
chemin de balade, une à chaque point (sauf l'écurie), le visage tourné vers le cavalier qui arrive. On les trouve **à
cheval** en passant à côté (à pied, le jeu dit de monter). Annoncée une fois par partie ; « ☀️ Sa journée » montre où
on en est, avec « 🧭 Guide-moi vers une citrouille » (la flèche jaune montre la plus proche, puis la suivante). Toutes trouvées : 50 🪙 (en gestion), lien +3, et le **tapis citrouille** (orange à liseré noir), rangé dans
la sellerie et mis tout de suite au cheval s'il est sellé ; il ne s'achète pas, il se gagne (« 🎃 À gagner »). Une
chasse par an ; « 🎃 Citrouilles trouvées » dans le carnet du cavalier.

### Le fer porte-bonheur du jour (0.5, `src/sim/luckyShoes.js`, `src/game/LuckyShoes.js`)
Chaque vrai jour (date de l'appareil), un vieux fer est posé au bord du chemin de balade de la ferme, à gauche (loin
des troncs et des citrouilles), et brille toutes les 2 secondes pour qu'on le voie de loin ; le tutoriel fini, avec un
cheval à toi. En selle à la ferme : « 🍀 Un fer porte-bonheur brille sur le chemin de balade ! ». On le ramasse **à
cheval** en passant à côté (à pied, le jeu dit de monter) : il saute, 🍀 au-dessus du cheval, et un petit mot dit ce
qu'il a de vrai (« Fer de derrière : plus pointu. 3/7 »). Il est cloué sur la porte du box du cheval qu'on montait,
sous ses flots. 7 fers à collectionner, un nouveau chaque jour : de devant (rond), de derrière (plus pointu), de poney
(tout petit), de cheval de trait (plus d'un kilo), à crampons (pour ne pas glisser sur l'herbe), en œuf (fermé
derrière, il soutient les talons), en aluminium (très léger, pour les courses). Les 7 : 50 🪙 (en gestion), lien +3 et
un souvenir ; ensuite, le fer du jour rapporte 5 🪙. « 🍀 Fers porte-bonheur » dans le carnet du cavalier.

### Les Galops (0.5, `src/sim/galops.js`, `src/ui/galops.js`)
Les examens des cavaliers dans les clubs français, en plus simple : Galop 1 « Je découvre mon cheval » (le caresser,
le panser, foin, eau, le monter), Galop 2 « Je m'occupe de lui » (le seller soi-même, galoper, une leçon de saut, une
journée parfaite, qu'il vienne quand tu l'appelles, trotter enlevé), Galop 3 « En route vers l'aventure » (longe, un
sans-faute, une balade, le vermifuge, trois journées parfaites, trois troncs sautés en balade). La pratique se coche
toute seule en jouant ; quand elle est finie, un petit mot le dit, et l'examen s'ouvre : 5 questions tirées parmi 8
(les robes, les allures, la sécurité autour du cheval, ses soins, sa santé), une réponse par question et son
explication, 4 bonnes réponses pour l'avoir (sinon on relit et on réessaie). Réussi : un **diplôme** (ton prénom, le
cheval avec qui tu l'as passé, le jour), qu'on revoit dans le panneau (« 🎓 Mon diplôme »). Chaque Galop rapporte des pièces (60,
100, 150) et rend le cavalier plus sûr : en balade, le cheval fait moins d'écarts (+20 % de temps entre deux écarts
par Galop). On y vient par le terrain de concours (« 🏅 Passer mes Galops ») ou la fiche du cheval (« 🏅 Tes Galops ») ;
le Galop 1 est aussi un chapitre de l'histoire. En bas du panneau, « 📔 Ton carnet de cavalier » : fois en selle,
galops, trots enlevés, troncs sautés, sans-faute, balades, appels, journées parfaites, voyages à cheval.

### Vétérinaire : mini-jeux
- Examen : trouver la zone qui fait mal.
- Prendre la température.
- Soigner : pansement, piqûre, médicament.

## 5. Dressage et activités
- **Tours** : assis, couché, donner la patte, rapporter, sauter…
- **Travail à pied** (chevaux) : longe, liberté, désensibilisation.
- **Équitation** : balade libre, galop, saut d'obstacles, dressage, concours.
- **Les allures en balade libre** (0.5, `src/sim/riding.js`) : en selle, des boutons ✋ Arrêt, 🐢 Pas, 🐴 Trot,
  💨 Galop (touches 0 1 2 3 ; téléphone : une colonne à droite, paysage : une rangée au-dessus des boutons de
  vue, ordinateur : en bas à gauche). On part au pas ; le joystick (ou les flèches) dirige, l'allure choisie donne la
  vitesse (pas 1,6 m/s, trot 3, galop 5, rapportés à la taille du cheval : l'animation prend bien l'allure choisie).
  Maj, 🏃 ou le joystick au bord : le grand galop. Le galop fatigue le cheval (énergie), le fait transpirer (pansage)
  et lui donne soif ; le pas et l'arrêt le reposent. Fatigué (énergie < 25), il ne galope plus et le dit ; épuisé
  (< 10), il ne fait plus que marcher. Au trot et au galop, il fait parfois un **écart** (un oiseau, un sac
  plastique, son ombre…) : un bond de côté, il ralentit, on le rassure et on repart ; un cheval timide en fait plus,
  un calme et un cheval obéissant (dressage) moins. Pendant une activité (saut, dressage…), c'est elle qui mène.
  Au téléphone, en selle : deux messages au plus à la fois (un seul en paysage ou sur un petit écran), à côté des
  allures et de ⤴️ Sauter (les suivants attendent leur tour ; le conseil de ⤴️ Sauter passe devant) ; les pastilles
  d'état pâlissent en portrait pour laisser voir le chemin (le chrono du cross reste net, en petit), et « Tu montes… »
  laisse la place au gros bouton « ⬇️ Descendre ».
- **Entraînement** : stats qui progressent (vitesse, endurance, obéissance,
  saut, dressage).
- **Dressage des chevaux** (`src/sim/dressage.js`, `src/game/Dressage.js`) : un
  rectangle 18 × 36 m avec les lettres A-K-E-H-C-M-B-F dessiné dans la carrière.
  Séances à la carrière, une fois par heure de jeu et par cheval (+2 à +6 en
  dressage ; un cheval fatigué, stressé ou peu attaché apprend moins) :
  **plat** (prendre l'allure annoncée au bon moment : pas / trot / galop avec un
  seul bouton d'allure), **figures** (suivre les pastilles au sol et la flèche :
  cercle, diagonale, serpentine, arrêt, reculer) et la **leçon de saut**.
  **Reprise de dressage** : 8 à 10 figures notées sur 10 par le juge à C
  (précision, allure, calme, rythme), total en pourcentage.
- **Métier éducateur canin** (💼, niveau 3) : des maîtres amènent leur chien
  qui a un problème (tire en laisse, saute sur les gens, ne revient pas au
  rappel, aboie, a peur, n'obéit pas). Le chien reste à la ferme ; une séance
  par jour (mini-jeu « Les ordres » : assis, couché, pas bouger, au pied,
  rappel — la friandise se donne juste quand il obéit, ni avant ni après ;
  vraie promenade en laisse pour le chien qui tire). Quand le problème est
  réglé (ou au jour prévu), le maître revient : démonstration, étoiles,
  paiement, réputation. Trois rangs : plus de chiens à la fois, nouveaux
  problèmes, chiens de refuge, coaching troupeau et agility de ses animaux.

## 6. Adoption et argent
- Partout : **refuge**, **animalerie**, **élevage**, animaux **trouvés** en
  balade ou en voyage.
- **Mode bac à sable** au début : argent illimité.
- **Mode gestion** (au choix dans le profil) : il faut gagner de l'argent
  (petits boulots, concours, spectacles, produits de la ferme ; pension pour animaux
  prévue plus tard) et le dépenser (nourriture, soins, accessoires, logements, aides).

## 7. Maison et logements
- Maison, jardin et **écuries présentes par défaut**.
- Construction depuis la vue d'ensemble : niches, clapiers, paddocks, prés, abris,
  granges, carrières, écuries, ranchs, décorations (fait). Décoration de l'intérieur
  de la maison : plus tard.

## 8. Voyages
- Libre : carte du monde, voiture, van, avion, bateau **ou à cheval**.
- On peut emmener **tous** ses animaux avec soi. Ceux qui restent sont gardés par
  le voisin (leurs besoins ne baissent pas).
- Pendant le trajet, les besoins baissent moins vite (on fait des pauses).
- Règles réalistes : pas de cheval dans une voiture (il faut le van), il faut
  le bateau ou l'avion pour traverser la mer, et on peut aller à cheval jusqu'en
  Suisse.
- **À cheval, en temps réel** (0.5, `src/game/TrailView.js`) : on chevauche son cheval
  sur un chemin de terre en 3D, à travers le paysage du départ puis celui de l'arrivée ;
  les autres animaux du voyage suivent derrière. On choisit l'**allure** (🐢 pas,
  🐴 trot, 💨 galop ; flèches ↑ ↓ au clavier) : le galop fait arriver plus vite mais
  fatigue le cheval (il tient une demi-minute, puis repasse au trot tout seul), le pas
  le repose et le calme (`RIDE_GAITS`, `src/sim/trip.js`). Trois caméras : derrière,
  en selle (entre les oreilles), autour. Aux pauses, le cheval s'arrête près d'un
  abreuvoir et d'une barre d'attache (l'écurie d'étape le soir) ; ×3, ×8 et « aller
  jusqu'à l'arrivée » restent là. En selle toujours avec sa bombe (parti à pied, et
  remis en selle à l'arrivée). Le bilan d'arrivée dit d'abord s'il boite (un caillou :
  cure ses pieds ; un fer perdu : ferre-le) ou s'il est malade (le vétérinaire), sans
  « Bravo ! ».
- Sur place : animaux uniques à adopter, concours, quêtes, exploration, photos.
- Destinations (11) : Normandie (maison), plage de Bretagne, Alpes suisses, Islande,
  ranch en Alberta, campagne de Kyoto, Cotswolds, Andalousie, haras du Kentucky,
  Pampa, bush australien. Prévu ensuite : savane africaine…
- **Concours à l'extérieur** (`src/sim/competitions.js`,
  `src/game/CompetitionVenue.js`, `src/ui/competitions.js`) : un calendrier sur
  plusieurs lieux (Normandie, Cotswolds, Kentucky, Andalousie, Alpes, Bretagne)
  avec date, discipline (saut, dressage, agility, spectacle ; crochet `beauty`),
  niveau (club / régional / Grand Prix), frais et prix. On s'inscrit à l'avance
  (Activités → 📅 Calendrier ou Journal), puis on part en van / voiture avec les
  animaux inscrits (« Mes inscriptions » → 🚐). Le jour J, sur place, un **site de
  concours** s'installe autour de la carrière (tribunes pleines, paddock
  d'échauffement, boxes, podium, fanions) : échauffement, épreuve (parcours de
  saut plus grands avec double, triple, rivière, mur ; **barrage** en cas
  d'égalité), podium avec photo dans l'album, coupes, flots, argent, XP, titres
  (Champion club / régional / Grand Prix). L'animal doit être en forme (faim,
  soif, énergie ≥ 50, ni malade ni enceinte).
- Au concours de saut ou de dressage, le cheval est **sellé et bridé** à sa
  taille : au départ, le coffre du van emporte sa selle et son filet (la selle
  de dressage pour un concours de dressage, si on l'a ; voir `src/sim/cargo.js`) ;
  sur place, le bouton « 🏇 Seller » les met. Selle et bride de dressage
  ajoutent un peu de brillance aux notes du juge.
- **Métier 💼 Cavalier de concours** (`rider` dans `src/sim/careers.js`) : carnet
  (séance de plat ou figures, reprise notée, inscription, départ en van, concours,
  podium), XP de métier, trois rangs, réputation (podium : elle monte ; place
  vide : elle baisse) et avantages (inscriptions −20 % puis −50 % avec un sponsor,
  primes +15 % puis +30 %). Pas de visiteurs pour ce métier.

## 9. Météo, jour et nuit, saisons
- Cycle jour/nuit.
- Météo **propre à chaque lieu** et à la **saison**. La saison suit la vraie
  date de l'appareil (pas besoin de réseau). Exemples : neige dans les Alpes
  l'hiver, pluie en Bretagne, soleil sur la savane.
- La météo a un effet sur les animaux (froid → besoin d'abri ou de couverture).

## 10. Quêtes et succès
- **L'histoire : ton premier cheval** (quête principale ⭐, 0.5 ; avant, une histoire « n'importe quel animal ») :
  le jeu est d'abord un jeu de cheval. 23 chapitres en deux parties, un seul à la fois, faisables dans toutes les maisons sans
  chance et sans gros budget : adopter son premier cheval au refuge (gratuit ; à la maison, le premier cheval de la
  liste est toujours adulte, on peut le monter), faire connaissance (caresses), le foin, l'eau fraîche, le pansage
  complet, monter en selle, passer au trot puis au galop (3 secondes de galop), la visite chez le vétérinaire, le
  Galop 1 (src/sim/galops.js), la première leçon, le premier saut, la première balade ; puis vers le concours :
  tresser sa crinière, trois séances de dressage, une reprise, et le premier concours du club (10 🪙, tous les trois
  jours à la maison). **Partie 2, « Ton cheval et toi, vers le Galop 3 »** (annoncée par une carte 📖 à la fin du
  premier concours ; « Quoi de neuf » la signale aux parties qui l'avaient déjà fini) : l'appeler (de loin, depuis sa
  fiche), le trot enlevé, trois journées parfaites, le Galop 2, trois troncs sautés, le cross, et le Galop 3 (la
  pratique qui reste se lit dans le panneau des Galops). Les soins d'un cheval se comptent à part (un chien caressé ne fait pas avancer l'histoire du
  cheval). Le tutoriel montre d'abord la carte d'un cheval au refuge. Les quêtes des autres animaux (un tour, un
  spectacle, un métier, un premier client…) sont des quêtes secondaires ; une ancienne partie qui a déjà un cheval
  finit tout de suite le premier chapitre. Un chapitre trop dur se **passe pour l'instant** (le suivant arrive) et se
  **reprend** plus tard depuis le journal : il redevient le chapitre en cours s'il vient avant, sinon il va dans « Mes
  quêtes ».
- **Quêtes secondaires** (🎯), rangées par thème (ton cheval, animaux, voyages, activités et concours, métiers) : l'enfant
  **rejoint** celles qu'elle veut (3 au plus en même temps) et les **enlève** quand elle veut, sans rien perdre.
  Une quête qu'on ne peut pas encore faire dit pourquoi (« Il te faut un mâle et une femelle ») ; elle ne se
  suit pas (🧭 ne guide jamais vers l'impossible) et rien n'est imposé.
  Le thème « Ton cheval » va plus loin que l'histoire : trois journées parfaites, le Galop 1, l'appeler (et qu'il
  vienne), trotter enlevé, sauter 3 troncs en balade, finir un cross.
- **Jongler et passer** (0.5), au téléphone comme à l'ordinateur : avec plusieurs quêtes en cours (le chapitre et
  les quêtes rejointes), le suivi à l'écran a un bouton **⇄** (touche **N** au clavier) qui met la suivante devant ;
  ses petits points disent combien il y en a. La bulle d'une quête (toucher son nom) montre **« Tes quêtes : »**,
  une pastille par quête en cours : la toucher la met devant. Si on suivait une quête (🧭), on suit celle qu'on
  met devant, **reprise à la même étape** (une quête pas encore possible s'affiche avec ce qu'il faut d'abord, et
  le suivi reprend à la suivante). **⏭️ Passer pour l'instant** marche pour toutes : le chapitre en cours (le
  suivant arrive) comme une quête rejointe, qui va dans **« ⏭️ Mises de côté »** (journal, 🎯 Mes quêtes) d'où
  **↩️ Reprendre** la remet. Après avoir passé, la bulle montre la quête qui est maintenant devant. Le journal
  marque la quête du suivi « 📌 À l'écran », et « 👉 Montre-moi » la met devant. Ce qu'on trouve au refuge (un animal, un
  cheval) ne bloque pas : le suivi y emmène d'abord.
- Toute quête finie donne sa récompense, rejointe ou non. Le suivi sur le côté de l'écran montre la quête suivie
  (🧭), sinon le chapitre en cours, sinon la première quête rejointe (src/sim/quests.js). La fin d'un chapitre est
  fêtée par le guide dès qu'aucune fenêtre n'est ouverte (le petit mot attend : src/ui/questNotices.js) ; en selle, un message dit tout de suite la suite et la bulle attend qu'on descende.
- Succès à débloquer.

## 11. Technique
- **Three.js** + **Vite**, JavaScript.
- PWA : `manifest` + service worker qui met tout le jeu en cache, puis fonctionne
  **sans réseau**.
- Sauvegardes dans le `localStorage` de l'appareil, une par profil.
- Modèles 3D : générés par le code dans la v0.1 ; remplacés ensuite par des
  modèles glTF gratuits sous licence libre (CC0) pour gagner en réalisme.
- Vignettes des cartes (sellerie, animalerie, construction, véhicules) : les
  modèles 3D du jeu photographiés hors écran (`src/game/thumbs.js`), une à la fois,
  quand la carte devient visible, puis gardées en mémoire ; un emoji en attendant
  (et à la place, si WebGL manque). Mesures dans ⚙️ Réglages.

## 12. Feuille de route

| Version | Contenu |
|---|---|
| **0.1** (prototype, fait) | Profils, avatar, maison + écurie + carrière, 4 espèces et 39 races, besoins, personnalités, vieillissement et mort de vieillesse, bébés, refuge et élevages locaux, vétérinaire (mini-jeu), dressage des tours, entraînement, longe et liberté, monter à cheval, caméra 1ʳᵉ/3ᵉ personne, jour/nuit, météo par lieu et saison, voyage dans 6 lieux (voiture, van, cheval, bateau, avion), quêtes et succès, petits boulots, modes bac à sable et gestion, FR/EN, hors ligne |
| **0.2** (fait) | Concours et spectacles sur le terrain de concours, apprentissage du saut, parcours d'obstacles, agility, balade, lapin-hop ; mini-jeux pour chaque soin (brosser, laver, ferrer, tonte, traite…) ; vétérinaire à jouer soi-même |
| **0.3** (fait) | Vue d'ensemble et construction (niches, clapiers, paddocks, prés, abris, granges, carrières, écuries, ranchs, décorations), déplacement des équipements ; moutons, chèvres et vaches ; événements spéciaux ; aides à embaucher et à qui parler ; voyages réalistes (van, pauses, stress) ; tutoriel guidé ; 11 lieux ; publication sur GitHub Pages. Reste à faire : décoration de l'intérieur de la maison (reportée en 0.5) |
| **0.4** (fait) | Graphismes plus beaux (sol, végétation, lumière, bâtiments, animations), animaux réalistes (chevaux, chiens race par race, chats, lapins, moutons, chèvres, vaches) et cavalier en selle, vrai saut d'obstacles ; sons synthétisés (ambiance, voix des animaux, pas, interface) ; mini-jeux des corvées et notation « juste ce qu'il faut » dans tous les mini-jeux ; vignettes 3D des cartes (sellerie, animalerie, construction, véhicules) ; vue construction (grille, enclos à la taille voulue, écurie qui s'agrandit) ; 4x4 et van à chevaux ; métiers toiletteur, éducateur canin, guide de randonnée, concours de beauté, concours à l'extérieur, école vétérinaire ; espèces proposées au fil de la partie ; sauvegarde en ligne facultative ; jeu au clavier ; histoire de la ferme (10 chapitres) et quêtes secondaires à rejoindre ; version « à emporter » en un seul fichier |
| **0.5** (en cours) | Fait : jongler entre le chapitre et les quêtes rejointes (⇄, touche N, pastilles « Tes quêtes »), passer n'importe quelle quête pour l'instant (⏭️ ; « Mises de côté » et ↩️ Reprendre), suivi pas à pas repris à la même étape ; voyage à cheval en temps réel (chemin en 3D, ceux qui suivent, allure pas / trot / galop qui fatigue ou repose le cheval, trois caméras) ; allures en balade libre (arrêt, pas, trot, galop, grand galop ; fatigue, sueur, écarts) ; pansage complet du cheval (étrille, brosse, cure-pied sur les quatre pieds, peigne) ; l'histoire devient celle de ton premier cheval (23 chapitres : du refuge au premier concours, Galop 1 compris, puis la partie 2 vers le Galop 3) ; le cheval vivant (il t'accueille quand tu reviens, il se roule au pré) ; seller et desseller (tapis, selle, sangle en deux fois) ; brider et débrider (le mors, les oreilles, la sous-gorge ; jamais de filet au box ni au pré) ; les pieds du cheval (pas curés : un caillou, il boite) ; en balade, le cheval gourmand s'arrête pour brouter ; le carnet de santé du cheval (vermifuge en mini-jeu : la dose selon son poids, vaccins, dents, maréchal-ferrant) ; la journée de ton cheval (sa routine, « journée parfaite ») ; les Galops 1 à 3 (pratique avec ton cheval, puis un petit examen) ; ses oreilles disent comment il va ; l'appeler (il vient au trot) ; le trot enlevé en rythme ; sauter des troncs en balade ; la ration (foin, puis un peu de granulés) ; la terre et le brillant de sa robe selon les soins ; le défi du jour ; le carnet du cavalier ; Halloween au poney-club (chasse aux citrouilles à cheval, tapis citrouille) ; la détente et le retour au calme au pas ; l'histoire, partie 2 (vers le Galop 3) ; les souvenirs de ton cheval ; ses flots sur la porte de son box ; ce que le lien débloque (l'appel toujours entendu, le suivre en liberté) ; tout assorti (tapis, guêtres et bombe de la même couleur). À venir : décoration de l'intérieur de la maison |
| 1.0 | Publication |

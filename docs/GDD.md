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
  marche doucement, on ne le monte plus, un message le dit). Le cure-pied du pansage enlève la terre ; le caillou est
  dans le pied qui boite (la consigne le nomme) : l'enlever, et il ne boite plus. Le vétérinaire aussi. Laissé deux
  jours, le caillou fait un abcès : il est malade (vétérinaire). Les soins sans mini-jeu (pour tous les chevaux, les
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

**Seller et desseller** (0.5, `src/ui/minigames/seller.js`) : le premier cheval arrive sellé. « 🧰 Desseller » range
la selle et le tapis à la sellerie (après le galop, le jeu le rappelle : sans selle, au pré, le cheval va se rouler).
Pas de selle sur le dos : « 🏇 Seller et monter » (ou « 🪢 Seller » seul, ou « 🐎 Monter à cru »). Le mini-jeu, en
trois étapes « juste ce qu'il faut » : ① le tapis glissé sur le dos, juste derrière le garrot (trop en avant, il
gêne les épaules ; trop en arrière, il appuie sur les reins) ; ② la selle posée sur le tapis, au même endroit ;
③ la sangle serrée en deux fois en gardant le doigt sur 🪢 Serrer : la première fois, le cheval gonfle le ventre et
la sangle se relâche, on resserre ensuite ; trop serrée, il couche les oreilles. On remet la même selle qu'avant.

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
et des 💞. Un cheval qui te fait confiance fait moins d'écarts en balade.

### « 💡 Le savais-tu ? » (0.5, `src/sim/horseFacts.js`)
À la fin de chaque mini-jeu fait avec un cheval, un fait vrai sur les chevaux (22, qui défilent sans se répéter) :
il boit 30 à 50 litres par jour, il dort debout, on monte par la gauche, la fourchette aide le sang à remonter…

### La journée de ton cheval (0.5, `src/sim/horseDay.js`)
La routine d'un vrai propriétaire, chaque jour de jeu, dans sa fiche (« ☀️ Sa journée ») : 🌅 foin du matin (avant
14 h), 🌇 foin du soir (dès 14 h), 💧 eau fraîche, 🪮 pansage, 🏇 le faire travailler (monter, longe, liberté, une
activité) et ❤️ un câlin. Tout coché : « 🌟 Journée parfaite » (lien +3, affection +10, de l'XP). Quête du thème
« 🐴 Ton cheval » : trois journées parfaites.

### Le carnet de santé du cheval (0.5, `src/sim/horseHealth.js`)
Comme pour un vrai cheval (raccourci dans le temps du jeu) : 🪱 vermifuge tous les 20 jours (bouton dans sa fiche,
12 🪙), 💉 vaccins et 🦷 dents tous les 60 jours (contrôlés à chaque visite chez le vétérinaire), 🔨 maréchal-ferrant
tous les 14 jours (« Ferrer »). Dans sa fiche, « 📒 Carnet de santé » dit pour chaque soin s'il est à jour, pour
quand, ou en retard. Le jour venu, un rappel. En retard : sans vermifuge il maigrit et perd de la santé, les dents
mal contrôlées le font maigrir (il mâche mal), sans vaccin il attrape plus facilement la grippe, et des fers usés
depuis 3 jours finissent par tomber (il boite : on le ferre). Bien suivi : rien de tout ça.
Le vermifuge est un mini-jeu (`src/ui/minigames/deworm.js`) : on règle la bague de la seringue sur son poids
(environ 250 kg pour un poney, 500 pour un cheval, 750 pour un cheval de trait, selon qu'il est maigre ou rond), puis
on glisse la seringue dans le coin de sa bouche (là où il n'a pas de dents) et on pousse toute la pâte.

### Ses oreilles (0.5, `src/sim/horseEars.js`)
Les oreilles du cheval 3D disent comment il va, comme en vrai : en avant (attentif, curieux ; quand tu t'approches,
il les pointe vers toi), sur le côté (il somnole, il est fatigué), couchées en arrière (il a mal, faim, soif, ou il est
grognon). Sa fiche le dit aussi : « 👂 Oreilles couchées en arrière : Étoile a faim… ». (Question du Galop 1.)

### La ration du cheval (0.5, `src/ui/minigames/ration.js`)
« Nourrir » le cheval est un mini-jeu en deux temps, comme en vrai : d'abord bien remplir son filet à foin (il mange
du foin presque toute la journée : au moins 75 %), puis une petite mesure de granulés dans le seau (la zone verte,
15 à 30 % du seau). Trop de granulés (55 % et plus) : le jeu prévient, la note est basse, et une fois sur deux il a
mal au ventre (les coliques : malade, « ventre », le vétérinaire le soigne).

### Sauter en balade (0.5, `src/sim/freeJumps.js`, `src/game/FreeJumps.js`)
À la ferme, quatre troncs couchés en travers du chemin de balade (un tronçon sur deux). Au galop, bien droit, à moins
de 12 m : un bouton orange « ⤴️ Sauter » (Espace). Appel entre 3,6 et 0,4 m du tronc, idéal à 1,8 m : un beau saut
(⭐) ; rien touché, lancé au galop, il saute tout seul au dernier moment (moins bien). Au trot, il l'enjambe d'un
petit bond ; au pas, il passe tranquillement. Pendant une activité ou une balade guidée, les troncs sont rangés.
Le saut reprend celui des séances d'obstacles (bascule, membres repliés, cavalier en suspension) ; chaque saut
entraîne un peu le cheval (+0,2 à +0,4 en saut). Ils se sautent dans les deux sens.

### Le trot enlevé (0.5, `src/sim/posting.js`)
À cheval en balade libre, en selle (avec des étriers), au trot : un gros bouton rond « ⬆️ Enlever » (Espace au clavier).
Un cercle se referme sur lui à chaque foulée ; on touche quand il se referme (le sabot tape), à 20 % de foulée près,
une fois par foulée. Trois bons temps de suite : le cavalier se lève et se rassoit en rythme (trot enlevé), et le trot
fatigue deux fois moins le cheval ; sans toucher (1,6 foulée), on retombe assis (on rebondit dans la selle). Huit
de suite : bravo (pratique du Galop 2). La première fois, un petit mot explique comment faire.

### Appeler ton cheval (0.5, `src/sim/horseCall.js`)
« 📣 Appeler » (menu du cheval) : de loin, il lève la tête et hennit. S'il te fait assez confiance, il vient vers toi au
trot et s'arrête près de toi, tout content (le lien grandit un peu, trois fois par jour au plus) ; sinon il te regarde
et reste là. Chance qu'il vienne : 15 % + lien / 60 (+ 20 % s'il a faim : il espère du foin) ; lien 51 et plus : il
vient toujours. Il ne vient pas s'il dort, s'il a mal (il boite, il est malade) ou s'il est au box (il hennit pour te
répondre). Pratique du Galop 2.

### Les Galops (0.5, `src/sim/galops.js`, `src/ui/galops.js`)
Les examens des cavaliers dans les clubs français, en plus simple : Galop 1 « Je découvre mon cheval » (le caresser, le
panser, foin, eau, le monter), Galop 2 « Je m'occupe de lui » (le seller soi-même, galoper, une leçon de saut, une
journée parfaite, qu'il vienne quand tu l'appelles, trotter enlevé), Galop 3 « En route vers l'aventure » (longe, un sans-faute, une balade, le vermifuge, trois journées
parfaites). La pratique se coche toute seule en jouant ; quand elle est finie, un petit mot le dit, et l'examen s'ouvre :
5 questions tirées parmi 8 (les robes, les allures, la sécurité autour du cheval, ses soins, sa santé), une réponse par
question et son explication, 4 bonnes réponses pour l'avoir (sinon on relit et on réessaie). Chaque Galop rapporte des
pièces (60, 100, 150) et rend le cavalier plus sûr : en balade, le cheval fait moins d'écarts (+20 % de temps entre deux
écarts par Galop). On y vient par le terrain de concours (« 🏅 Passer mes Galops ») ou la fiche du cheval (« 🏅 Tes
Galops ») ; quête « Passer ton Galop 1 » dans le thème du cheval.

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
  jusqu'à l'arrivée » restent là.
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
  le jeu est d'abord un jeu de cheval. 16 chapitres, un seul à la fois, faisables dans toutes les maisons sans
  chance et sans gros budget : adopter son premier cheval au refuge (gratuit ; à la maison, le premier cheval de la
  liste est toujours adulte, on peut le monter), faire connaissance (caresses), le foin, l'eau fraîche, le pansage
  complet, monter en selle, passer au trot puis au galop (3 secondes de galop), la visite chez le vétérinaire, le
  Galop 1 (src/sim/galops.js), la première leçon, le premier saut, la première balade ; puis vers le concours :
  tresser sa crinière, trois séances de dressage, une reprise, et le premier concours du club (10 🪙, tous les trois
  jours à la maison). Les soins d'un cheval se comptent à part (un chien caressé ne fait pas avancer l'histoire du
  cheval). Le tutoriel montre d'abord la carte d'un cheval au refuge. Les quêtes des autres animaux (un tour, un
  spectacle, un métier, un premier client…) sont des quêtes secondaires ; une ancienne partie qui a déjà un cheval
  finit tout de suite le premier chapitre. Un chapitre trop dur se **passe pour l'instant** (le suivant arrive) et se
  **reprend** plus tard depuis le journal : il redevient le chapitre en cours s'il vient avant, sinon il va dans « Mes
  quêtes ».
- **Quêtes secondaires** (🎯), rangées par thème (ton cheval, animaux, voyages, activités et concours, métiers) : l'enfant
  **rejoint** celles qu'elle veut (3 au plus en même temps) et les **enlève** quand elle veut, sans rien perdre.
  Une quête qu'on ne peut pas encore faire dit pourquoi (« Il te faut un mâle et une femelle ») ; elle ne se
  suit pas (🧭 ne guide jamais vers l'impossible) et rien n'est imposé.
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
  fêtée par le guide dès qu'aucune fenêtre n'est ouverte (le petit mot attend : src/ui/questNotices.js).
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
| **0.5** (en cours) | Fait : jongler entre le chapitre et les quêtes rejointes (⇄, touche N, pastilles « Tes quêtes »), passer n'importe quelle quête pour l'instant (⏭️ ; « Mises de côté » et ↩️ Reprendre), suivi pas à pas repris à la même étape ; voyage à cheval en temps réel (chemin en 3D, ceux qui suivent, allure pas / trot / galop qui fatigue ou repose le cheval, trois caméras) ; allures en balade libre (arrêt, pas, trot, galop, grand galop ; fatigue, sueur, écarts) ; pansage complet du cheval (étrille, brosse, cure-pied sur les quatre pieds, peigne) ; l'histoire devient celle de ton premier cheval (16 chapitres, du refuge au premier concours, Galop 1 compris) ; le cheval vivant (il t'accueille quand tu reviens, il se roule au pré) ; seller et desseller (tapis, selle, sangle en deux fois) ; les pieds du cheval (pas curés : un caillou, il boite) ; en balade, le cheval gourmand s'arrête pour brouter ; le carnet de santé du cheval (vermifuge en mini-jeu : la dose selon son poids, vaccins, dents, maréchal-ferrant) ; la journée de ton cheval (sa routine, « journée parfaite ») ; les Galops 1 à 3 (pratique avec ton cheval, puis un petit examen) ; ses oreilles disent comment il va ; l'appeler (il vient au trot) ; le trot enlevé en rythme ; sauter des troncs en balade ; la ration (foin, puis un peu de granulés). À venir : décoration de l'intérieur de la maison |
| 1.0 | Publication |

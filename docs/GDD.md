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

### Négligence
1. Un animal négligé devient **triste** (animation, il boude, il obéit moins).
2. Si ça continue, il **tombe malade** : il faut l'emmener chez le **vétérinaire**.
3. Pas d'abandon ni de mort par négligence (seulement de vieillesse).

### Vétérinaire : mini-jeux
- Examen : trouver la zone qui fait mal.
- Prendre la température.
- Soigner : pansement, piqûre, médicament.

## 5. Dressage et activités
- **Tours** : assis, couché, donner la patte, rapporter, sauter…
- **Travail à pied** (chevaux) : longe, liberté, désensibilisation.
- **Équitation** : balade libre, galop, saut d'obstacles, dressage, concours.
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
- **Histoire de la ferme** (quête principale ⭐) : une suite de 10 chapitres, un seul à la fois, faisables par
  tout le monde avec n'importe quel animal et sans gros budget : adopter, caresser, nourrir, donner à boire,
  brosser, vétérinaire, un tour, un métier, un premier client, un voyage. Un chapitre trop dur se **passe pour
  l'instant** (le suivant arrive) et se **reprend** plus tard depuis le journal.
- **Quêtes secondaires** (🎯), rangées par thème (animaux, voyages, activités et concours, métiers) : l'enfant
  **rejoint** celles qu'elle veut (3 au plus en même temps) et les **enlève** quand elle veut, sans rien perdre.
  Une quête qu'on ne peut pas encore faire dit pourquoi (« Il te faut d'abord un cheval ») ; rien n'est imposé.
- Toute quête finie donne sa récompense, rejointe ou non. Le suivi sur le côté de l'écran montre la quête suivie
  (🧭), sinon le chapitre en cours, sinon la première quête rejointe (src/sim/quests.js).
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
| **0.3** (fait) | Vue d'ensemble et construction (niches, clapiers, paddocks, prés, abris, granges, carrières, écuries, ranchs, décorations), déplacement des équipements ; moutons, chèvres et vaches ; événements spéciaux ; aides à embaucher et à qui parler ; voyages réalistes (van, pauses, stress) ; tutoriel guidé ; 11 lieux ; publication sur GitHub Pages. Reste à faire : décoration de l'intérieur de la maison |
| **0.4** (en cours) | Fait : graphismes plus beaux (sol, végétation, lumière, bâtiments, animaux, animations), sons synthétisés (ambiance, voix des animaux, pas, interface), mini-jeux des corvées (curer, pailler, balayer, ranger, vaisselle), vignettes 3D des cartes (sellerie, animalerie, construction, véhicules). À venir : notation « juste ce qu'il faut » dans tous les mini-jeux, voyage à cheval en temps réel, nouvelles espèces |
| 1.0 | Publication |

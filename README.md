# La ferme à Madichelle 🐴🐶🐱🐰

Jeu 3D **gratuit** et **sans réseau** : adopte des animaux, occupe-toi d'eux comme dans la vraie vie et voyage avec eux à travers le monde, même à cheval.

Il fonctionne sur **téléphone** (joystick tactile) et sur **ordinateur** (clavier et souris), en français et en anglais.

## Jouer

```bash
npm install
npm run dev        # ouvre http://localhost:5173 (aussi accessible depuis un téléphone du même réseau)
```

La version installable et utilisable **hors ligne** est publiée sur GitHub Pages à chaque mise à jour de `main` :
**https://cocobomp.github.io/Animaleana/**. Ouvre-la une première fois, puis installe-la (« Ajouter à l'écran d'accueil » sur téléphone). Elle marche ensuite sans connexion. Les sauvegardes restent sur l'appareil. Quand une nouvelle version est publiée, un bandeau « Nouvelle version prête » propose de recharger (ou ⚙️ Réglages → Rechercher une mise à jour) ; l'écran d'accueil affiche la version en cours.

Pour vérifier le build sur l'ordinateur :

```bash
npm run build      # crée le dossier dist/
npm run preview    # http://localhost:4173 ; depuis un téléphone du même réseau, c'est du http : pas de cache hors ligne
```

### Jouer sur un ordinateur sans internet

Le site propose, sous le numéro de version de l'écran d'accueil, « 💾 Emporter le jeu sur un ordinateur » :
un seul fichier `La ferme à Madichelle.html` (script et styles inclus). On le télécharge depuis le téléphone, on
l'envoie par AirDrop, clé USB ou mail, puis on l'ouvre en double-cliquant : tout le jeu tourne depuis ce
fichier, sans serveur ni réseau. Les sauvegardes restent dans le navigateur de chaque appareil ; il faut
rouvrir le même fichier (au même endroit) pour les retrouver. Ce fichier est produit à chaque build
(`dist/ferme-madichelle.html`).

## Commandes

| Ordinateur | Téléphone | Action |
|---|---|---|
| ZQSD / WASD / flèches | joystick (à gauche) | marcher |
| Maj | pousser le joystick jusqu'au bord | courir / galoper |
| E | bouton vert | interagir |
| C | 🎥 | caméra 1ʳᵉ / 3ᵉ personne |
| glisser la souris, molette | glisser, pincer | tourner la vue, zoomer |

## Contenu (version 0.5)

- Plusieurs profils, avatar personnalisable, modes **bac à sable** et **gestion** (argent, petits boulots)
- 7 espèces et 116 races : chevaux, chiens, chats, lapins, moutons, chèvres, vaches (avec des races locales en voyage) ; chiens de troupeau
- Besoins réalistes, personnalités, maladies ; **vétérinaire à jouer soi-même** (examen, carnet, diagnostic, soin) et trousse de soins
- **Mini-jeux pour chaque corvée** : curer le box, pailler, balayer l'allée, ranger le salon, faire la vaisselle
- **Mini-jeux pour chaque soin** : nourrir, boire, brosser, laver, nettoyer, griffes, ferrer, caresser, friandise, jouer, longe, liberté, tonte et traite ; pour le cheval, un vrai **pansage** (étrille en petits ronds, brosse dans le sens du poil, cure-pied sur les quatre pieds du talon vers la pince, peigne pour les nœuds)
- Les animaux grandissent, vieillissent et peuvent avoir des bébés
- Dressage de tours, entraînement, longe et travail en liberté ; **équitation** (même à cru) avec de vraies allures (✋ arrêt, 🐢 pas, 🐴 trot, 💨 galop, grand galop) : le galop fatigue le cheval et le fait transpirer, et il fait parfois un écart ; promenade en laisse
- **Activités** : apprendre à sauter pas à pas, saut d'obstacles, agility, balade, lapin-hop, spectacles et concours sur le terrain de concours
- **Événements spéciaux** : orage, canicule, grand froid, animal blessé, cheval échappé, chiot perdu, voisin, naissance, fête du village
- **Métiers** (💼) : vétérinaire, gardien de pension et **toiletteur** ✂️ : on construit un salon de toilettage, des clients arrivent avec leur chien, leur chat ou leur lapin (puis cheval et mouton aux rangs suivants) ; chaque étape est un mini-jeu (bain, séchage sans faire peur, brossage et démêlage, coupe au pochoir, griffes, oreilles, dents, parfum) et on finit par un nœud ou un bandana ; avant / après, étoiles du client, paye, pourboire, réputation et trois rangs
- **Aides** à embaucher (palefrenier, berger, ouvrier agricole, vétérinaire) : on discute avec elles, on donne des consignes, elles font des pauses, gagnent de l'expérience et se forment
- **Métiers** (💼), avec un carnet d'actions, trois rangs et une réputation : vétérinaire, gardien de pension et **éducateur canin** (des maîtres amènent leur chien qui tire en laisse, saute sur les gens ou ne revient pas au rappel ; séances « assis, couché, pas bouger, au pied, rappel » où la friandise se donne au bon moment, démonstration au maître, paiement)
- 11 lieux : Normandie, Bretagne, Alpes suisses, Islande, Alberta, Kyoto, Cotswolds, Andalousie, Kentucky, Pampa, bush australien. Voyage réaliste en voiture, en van (chargement, pauses, stress), **à cheval en temps réel** (on chevauche sur les chemins, les autres animaux suivent ; pas, trot ou galop, qui fatigue le cheval), en bateau ou en avion ; on monte dans le 4x4 et le van à chevaux (le cheval monte le pont au licol, barres et filet à foin, coffre de transport, trajet suivi depuis la cabine)
- Jour et nuit, météo selon le lieu et la vraie saison (saisons inversées dans l'hémisphère sud)
- **Sons** doux, tous fabriqués par le code : voix des animaux (hennissement, aboiement, miaulement, bêlement, meuglement…), pas selon le sol, oiseaux le jour, grillons la nuit, vent, pluie et tonnerre ; réglables dans ⚙️ Réglages
- Tutoriel guidé pour les enfants, l'**histoire de la ferme** (10 chapitres) et des **quêtes secondaires** à rejoindre (3 au plus) ; on **jongle** entre le chapitre et ses quêtes d'un toucher (⇄ sur le suivi de quête, touche N au clavier, ou les pastilles « Tes quêtes » de sa bulle) et on **passe** celle qu'on veut pour l'instant (⏭️ : un chapitre passé se reprend dans l'histoire, une quête passée dans « ⏭️ Mises de côté ») ; succès, mode Auto (le personnage prévoit et fait ses prochaines tâches simples)
- **Vue d'ensemble** (🗺️) : la ferme vue d'en haut, on donne des ordres à chaque bâtiment, enclos ou animal, et on **construit** niches, clapiers, paddocks, prés, abris, granges, carrières, écuries, ranchs et décorations ; on **déplace** aussi les équipements (mangeoires, abreuvoirs…), la bergerie, le paddock, la niche et le clapier (petit prix en mode gestion, gratuit en bac à sable)
- **Vue construction** (🏗️ Construire) : la ferme vue d'aplomb avec une grille de 1 m et les zones occupées en couleur ; on touche un enclos puis on **tire ses poignées** pour l'agrandir ou le réduire au mètre près (paddock de 22 × 26 m au départ, bergerie, enclos des lapins, paddocks, pré, carrière et ranch construits) : barrières, porte, places des animaux et équipements suivent. On y **rallonge l'écurie** (8 → 12 → 16 box), on déplace, tourne et vend
- **Métiers** (💼) aussi : **guide de randonnée** 🧭 (des cavaliers à emmener en balade, la liste à cocher avant de partir) et **concours de beauté** (inscription par classe, préparation, tresses, juge) ; concours de saut et de dressage à l'extérieur ; école vétérinaire
- Animaux **réalistes** (chevaux, chiens race par race, chats, lapins, moutons, chèvres, vaches) et cavalier assis en selle, pieds aux étriers ; un vrai saut d'obstacles (appel, bascule, réception)
- **Sauvegarde en ligne** facultative (compte Google) pour retrouver ses parties sur tous ses appareils ; sinon on joue en invité, tout reste sur l'appareil
- Installable sur téléphone (« Ajouter à l'écran d'accueil ») et jouable sans réseau après la première ouverture

Les règles du jeu sont décrites dans [docs/GDD.md](docs/GDD.md).

## Technique

- [Three.js](https://threejs.org) + [Vite](https://vitejs.dev), JavaScript.
- `src/sim/` : la logique du jeu (besoins, âge, voyages…), sans 3D, testée avec `npm test`.
- `src/game/` : le monde 3D. Tous les modèles, textures et sons (`audio.js`, Web Audio) sont générés par le code, il n'y a aucun fichier à télécharger.
- `src/ui/` : l'interface.

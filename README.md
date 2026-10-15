# Animadichelle 🐴🐶🐱🐰

Jeu 3D **gratuit** et **sans réseau** : adopte des animaux, occupe-toi d'eux comme dans la vraie vie et voyage avec eux à travers le monde, même à cheval.

Il fonctionne sur **téléphone** (joystick tactile) et sur **ordinateur** (clavier et souris), en français et en anglais.

## Jouer

```bash
npm install
npm run dev        # ouvre http://localhost:5173 (aussi accessible depuis un téléphone du même réseau)
```

Pour une version installable et utilisable hors ligne :

```bash
npm run build      # crée le dossier dist/
npm run preview
```

Ouvre le jeu une première fois, puis installe-le (« Ajouter à l'écran d'accueil » sur téléphone). Il marche ensuite sans connexion. Les sauvegardes restent sur l'appareil.

## Commandes

| Ordinateur | Téléphone | Action |
|---|---|---|
| ZQSD / WASD / flèches | joystick (à gauche) | marcher |
| Maj | pousser le joystick jusqu'au bord | courir / galoper |
| E | bouton vert | interagir |
| C | 🎥 | caméra 1ʳᵉ / 3ᵉ personne |
| glisser la souris, molette | glisser, pincer | tourner la vue, zoomer |

## Contenu (version 0.3)

- Plusieurs profils, avatar personnalisable, modes **bac à sable** et **gestion** (argent, petits boulots)
- 7 espèces et 91 races : chevaux, chiens, chats, lapins, moutons, chèvres, vaches (avec des races locales en voyage) ; chiens de troupeau
- Besoins réalistes, personnalités, maladies ; **vétérinaire à jouer soi-même** (examen, carnet, diagnostic, soin) et trousse de soins
- **Mini-jeux pour chaque soin** : nourrir, boire, brosser, laver, nettoyer, griffes, ferrer, caresser, friandise, jouer, longe, liberté, tonte et traite
- Les animaux grandissent, vieillissent et peuvent avoir des bébés
- Dressage de tours, entraînement, longe et travail en liberté ; équitation (même à cru) ; promenade en laisse
- **Activités** : apprendre à sauter pas à pas, saut d'obstacles, agility, balade, lapin-hop, spectacles et concours sur le terrain de concours
- **Événements spéciaux** : orage, canicule, grand froid, animal blessé, cheval échappé, chiot perdu, voisin, naissance, fête du village
- **Aides** à embaucher (palefrenier, berger, ouvrier agricole, vétérinaire) : on discute avec elles, on donne des consignes, elles font des pauses, gagnent de l'expérience et se forment
- 11 lieux : Normandie, Bretagne, Alpes suisses, Islande, Alberta, Kyoto, Cotswolds, Andalousie, Kentucky, Pampa, bush australien. Voyage réaliste en voiture, en van (chargement, pauses, stress), à cheval, en bateau ou en avion
- Jour et nuit, météo selon le lieu et la vraie saison (saisons inversées dans l'hémisphère sud)
- Tutoriel guidé pour les enfants, quêtes facultatives et succès, mode Auto (le personnage prévoit et fait ses prochaines tâches simples)
- **Vue d'ensemble** (🗺️) : la ferme vue d'en haut, on donne des ordres à chaque bâtiment, enclos ou animal, et on **construit** niches, clapiers, paddocks, prés, abris, granges, carrières, écuries, ranchs et décorations ; on **déplace** aussi les équipements (mangeoires, abreuvoirs…), la bergerie, le paddock, la niche et le clapier (petit prix en mode gestion, gratuit en bac à sable)
- Installable sur téléphone (« Ajouter à l'écran d'accueil ») et jouable sans réseau après la première ouverture

Les règles du jeu sont décrites dans [docs/GDD.md](docs/GDD.md).

## Technique

- [Three.js](https://threejs.org) + [Vite](https://vitejs.dev), JavaScript.
- `src/sim/` : la logique du jeu (besoins, âge, voyages…), sans 3D, testée avec `npm test`.
- `src/game/` : le monde 3D. Tous les modèles et textures sont générés par le code, il n'y a aucun fichier à télécharger.
- `src/ui/` : l'interface.

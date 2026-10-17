# La ferme à Madichelle : où est hébergé quoi

Ce document dit précisément où se trouve chaque partie du jeu, ce qu'elle contient, et comment
y accéder. À tenir à jour à chaque changement d'hébergement.

## En résumé

| Quoi | Service | Où (pays / région) | Ce qu'il y a dedans | Adresse |
|---|---|---|---|---|
| Code source | GitHub (dépôt `cocobomp/Animaleana`) | États-Unis (GitHub, Microsoft) | Le code du jeu, sans aucune donnée de joueur | https://github.com/cocobomp/Animaleana |
| Jeu en ligne (actuel) | GitHub Pages | Réseau mondial de serveurs (CDN) : chaque joueur reçoit les fichiers depuis le serveur le plus proche | Les fichiers du jeu seulement (images, code), aucune donnée de joueur | https://cocobomp.github.io/Animaleana/ |
| Jeu en ligne (prévu) | Firebase Hosting (Google) | Réseau mondial de Google (CDN), pas de choix de pays possible | Les fichiers du jeu seulement, aucune donnée de joueur | https://lafermeamadichelle.web.app |
| Sauvegardes en ligne (prévu) | Cloud Firestore (Google, projet `lafermeamadichelle`) | **Suisse : région `europe-west6` (Zurich)**, choisie à la création, impossible à changer ensuite | Les parties (profils, animaux, progression) de chaque compte, rien d'autre | Console : https://console.firebase.google.com/project/lafermeamadichelle/firestore |
| Connexion avec Google (prévu) | Firebase Authentication (Google) | Infrastructure mondiale de Google, pas de choix de pays possible | L'identifiant du compte Google et son adresse e-mail (fournis par Google) ; aucun mot de passe n'est gardé par le jeu | Console : https://console.firebase.google.com/project/lafermeamadichelle/authentication/users |
| Parties sur l'appareil | Mémoire du navigateur (localStorage) | Sur le téléphone ou l'ordinateur lui-même | La partie, même sans Internet | — |

Ce qui peut être en Suisse l'est : les sauvegardes (la seule donnée de joueur gardée en ligne).
Les fichiers du jeu sont publics et identiques pour tout le monde : ils passent par un réseau
mondial pour aller vite, sans donnée personnelle. La connexion Google est gérée par Google
lui-même, dans ses centres de données ; Firebase ne permet pas de choisir un pays pour elle.

**Option « tout en Suisse » pour les fichiers du jeu** : on peut aussi mettre les fichiers du jeu
chez un hébergeur suisse (par exemple Infomaniak, à Genève). Mais la connexion Google sur iPhone
marche de façon fiable seulement quand le jeu est à la même adresse que Firebase
(`lafermeamadichelle.web.app`) : chez un autre hébergeur, Safari bloque souvent la fenêtre de
connexion. C'est pour cela que l'hébergement Firebase est prévu.

## Liens directs (projet Firebase `lafermeamadichelle`)

| Page | Lien |
|---|---|
| Vue d'ensemble du projet | https://console.firebase.google.com/project/lafermeamadichelle/overview |
| Méthodes de connexion (activer Google) | https://console.firebase.google.com/project/lafermeamadichelle/authentication/providers |
| Domaines autorisés pour la connexion | https://console.firebase.google.com/project/lafermeamadichelle/authentication/settings |
| Base de données Firestore | https://console.firebase.google.com/project/lafermeamadichelle/firestore |
| Règles de sécurité Firestore | https://console.firebase.google.com/project/lafermeamadichelle/firestore/rules |
| Hébergement (Hosting) | https://console.firebase.google.com/project/lafermeamadichelle/hosting |
| Paramètres du projet | https://console.firebase.google.com/project/lafermeamadichelle/settings/general |
| Comptes de service (Google Cloud) | https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle |
| Accès et rôles (Google Cloud) | https://console.cloud.google.com/iam-admin/iam?project=lafermeamadichelle |

## Étapes de mise en place

### 1. Activer la connexion Google (à faire à la main, une seule fois)

1. Ouvrir https://console.firebase.google.com/project/lafermeamadichelle/authentication/providers
2. Si la page affiche « Get started » : cliquer dessus.
3. Onglet **Sign-in method** → dans la liste, cliquer **Google** → interrupteur **Enable**.
4. **Project support email** : choisir son adresse → **Save**.

### 2. Clé temporaire pour la mise en place (à supprimer ensuite)

1. Ouvrir https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle
2. En haut : **+ Créer un compte de service** (en anglais : *+ Create service account*).
3. Nom : `claude-temporaire` → **Créer et continuer**.
4. Rôle : menu **Basique** → **Éditeur** (*Basic → Editor*) → **Continuer** → **OK**.
5. Dans la liste, cliquer sur `claude-temporaire` → onglet **Clés** (*Keys*) →
   **Ajouter une clé** → **Créer une clé** → **JSON** → **Créer** : un fichier `.json` se
   télécharge.
6. Envoyer ce fichier à Claude dans la conversation. Il n'est jamais mis dans le dépôt du jeu.

Avec cette clé, Claude crée la base Firestore à Zurich (`europe-west6`), écrit les règles de
sécurité, prépare l'hébergement `lafermeamadichelle.web.app` et une clé limitée à la mise en ligne.

### 3. Supprimer la clé temporaire (quand Claude a fini)

1. Ouvrir https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle
2. Cocher `claude-temporaire` → **Supprimer** (icône corbeille) → confirmer.

### 4. Clé de mise en ligne automatique (dans GitHub, jamais dans la conversation)

Claude crée un compte de service limité à l'hébergement et donne la marche à suivre pour coller
sa clé dans **GitHub → dépôt → Settings → Secrets and variables → Actions → New repository
secret**. GitHub s'en sert ensuite à chaque nouvelle version, et le dépôt peut passer en privé.

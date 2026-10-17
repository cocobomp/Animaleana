# La ferme à Madichelle : où est hébergé quoi

Ce document dit précisément où se trouve chaque partie du jeu, ce qu'elle contient, et comment
y accéder. À tenir à jour à chaque changement d'hébergement.

## En résumé

| Quoi | Service | Où (pays / région) | Ce qu'il y a dedans | Adresse |
|---|---|---|---|---|
| Code source | GitHub (dépôt `cocobomp/Animaleana`) | États-Unis (GitHub, Microsoft) | Le code du jeu, sans aucune donnée de joueur | https://github.com/cocobomp/Animaleana |
| Jeu en ligne (adresse principale) | Firebase Hosting (Google) | Réseau mondial de Google (CDN), pas de choix de pays possible | Les fichiers du jeu seulement, aucune donnée de joueur | https://lafermeamadichelle.web.app |
| Jeu en ligne (ancienne adresse, gardée tant que le dépôt est public) | GitHub Pages | Réseau mondial de serveurs (CDN) | Les fichiers du jeu seulement, aucune donnée de joueur | https://cocobomp.github.io/Animaleana/ |
| Sauvegardes en ligne | Cloud Firestore (Google, projet `lafermeamadichelle`) | **Suisse : région `europe-west6` (Zurich)**, créée le 17 octobre 2026, impossible à changer ensuite | Les parties (profils, animaux, progression) de chaque compte, rien d'autre | Console : https://console.firebase.google.com/project/lafermeamadichelle/firestore |
| Connexion avec Google | Firebase Authentication (Google) | Infrastructure mondiale de Google, pas de choix de pays possible | L'identifiant du compte Google et son adresse e-mail (fournis par Google) ; aucun mot de passe n'est gardé par le jeu | Console : https://console.firebase.google.com/project/lafermeamadichelle/authentication/users |
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

## Ce qui est en place (17 octobre 2026)

| Élément | État | Détail |
|---|---|---|
| Connexion avec Google | ✅ activée | Le nom affiché dans la fenêtre Google (« Continuer vers … ») se règle ici : https://console.cloud.google.com/auth/branding?project=lafermeamadichelle → **App name** : `La ferme à Madichelle` |
| Adresses autorisées pour la connexion | ✅ | `localhost`, `lafermeamadichelle.web.app`, `lafermeamadichelle.firebaseapp.com`, `cocobomp.github.io` |
| Base des sauvegardes | ✅ créée à **Zurich** (`europe-west6`) | Une partie = un document `users/<compte>/saves/<partie>` |
| Règles de sécurité | ✅ en ligne (fichier `firestore.rules` du dépôt) | Chaque compte ne lit et n'écrit que ses propres parties ; sans compte, rien ; taille limitée |
| Hébergement | ✅ en ligne | https://lafermeamadichelle.web.app |
| Mise en ligne automatique depuis GitHub | ⏸️ prête, à allumer (voir plus bas) | Sans clé : GitHub prouve à Google que c'est ce dépôt (Workload Identity Federation) |

### Comptes de service du projet (https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle)

| Compte | À quoi il sert | Faut-il le garder ? |
|---|---|---|
| `firebase-adminsdk-fbsvc@…` | Créé automatiquement par Firebase | Oui, ne pas y toucher |
| `github-deploy@…` | Mettre le jeu en ligne depuis GitHub. Rôle limité : **Firebase Hosting Admin** (et lecture des services activés). Ne peut ni lire ni modifier les sauvegardes. Seul le dépôt `cocobomp/Animaleana`, branche `main`, peut l'utiliser | Oui |
| `claude-temporaire@…` | Mise en place faite par Claude (rôle Propriétaire) | **Non : à supprimer** dès que la mise en ligne automatique a marché une fois |

Le lien GitHub ↔ Google : *IAM → Workload Identity Federation*, groupe `github`, fournisseur `animaleana`
(https://console.cloud.google.com/iam-admin/workload-identity-pools?project=lafermeamadichelle).

## Allumer la mise en ligne automatique (une fois)

1. Ouvrir https://github.com/cocobomp/Animaleana/settings/variables/actions
2. Bouton vert **New repository variable**.
3. **Name** : `FIREBASE_DEPLOY` · **Value** : `on` → **Add variable**.

Ensuite, à chaque mise à jour de `main`, l'action « Publier le jeu (Firebase) » teste, construit et
met le jeu en ligne sur https://lafermeamadichelle.web.app. Pour l'arrêter : supprimer la variable ou
mettre `off`. Suivi des mises en ligne : https://github.com/cocobomp/Animaleana/actions

## Supprimer la clé temporaire (quand Claude a fini)

1. Ouvrir https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle
2. Cocher `claude-temporaire` → **Delete** (Supprimer, icône corbeille) → confirmer.
3. Supprimer aussi le fichier `.json` téléchargé (dossier Téléchargements de l'ordinateur).

## Passer le dépôt en privé (plus tard)

Le jeu reste en ligne sur https://lafermeamadichelle.web.app (Firebase ne dépend pas de la visibilité du
dépôt). GitHub Pages, lui, ne marche plus pour un dépôt privé avec un compte gratuit : l'ancienne adresse
`cocobomp.github.io/Animaleana` s'arrêtera. Les joueurs qui l'utilisent doivent passer à la nouvelle
adresse avant (les parties sont propres à chaque adresse : les sauvegarder dans un fichier, ou se connecter
avec Google, puis les retrouver sur la nouvelle adresse).

1. https://github.com/cocobomp/Animaleana/settings → tout en bas, **Danger Zone** → **Change repository
   visibility** → **Make private** → confirmer.

## Vérifier les règles de sécurité soi-même

Console → Firestore → onglet **Rules** :
https://console.firebase.google.com/project/lafermeamadichelle/firestore/rules
Le texte doit être le même que le fichier `firestore.rules` du dépôt.

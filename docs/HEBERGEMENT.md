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
| Avis des joueurs (« 💌 Ton avis ») | Cloud Firestore (même base, collection `feedback`) | **Suisse : `europe-west6` (Zurich)** | Les petits messages des joueurs : un smiley, une sorte, un texte court et un contexte sans donnée personnelle (voir « Les avis des joueurs ») | Console : https://console.firebase.google.com/project/lafermeamadichelle/firestore/databases/-default-/data/~2Ffeedback |
| Connexion avec Google | Firebase Authentication (Google) | Infrastructure mondiale de Google, pas de choix de pays possible | L'identifiant du compte Google et son adresse e-mail (fournis par Google) ; aucun mot de passe n'est gardé par le jeu | Console : https://console.firebase.google.com/project/lafermeamadichelle/authentication/users |
| Parties sur l'appareil | Mémoire du navigateur (localStorage) | Sur le téléphone ou l'ordinateur lui-même | La partie, même sans Internet | — |

Ce qui peut être en Suisse l'est : les sauvegardes et les avis des joueurs (les seules données gardées en ligne ; les
avis sont anonymes).
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
| 💌 Avis des joueurs (collection `feedback`) | https://console.firebase.google.com/project/lafermeamadichelle/firestore/databases/-default-/data/~2Ffeedback |
| Hébergement (Hosting) | https://console.firebase.google.com/project/lafermeamadichelle/hosting |
| Paramètres du projet | https://console.firebase.google.com/project/lafermeamadichelle/settings/general |
| Comptes de service (Google Cloud) | https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle |
| Accès et rôles (Google Cloud) | https://console.cloud.google.com/iam-admin/iam?project=lafermeamadichelle |

## Ce qui est en place (17 octobre 2026)

| Élément | État | Détail |
|---|---|---|
| Connexion avec Google | ✅ activée | Le nom affiché dans la fenêtre Google (« Continuer vers … ») se règle ici : https://console.cloud.google.com/auth/branding?project=lafermeamadichelle → **App name** : `La ferme à Madichelle` |
| Adresses autorisées pour la connexion (Firebase) | ✅ | `localhost`, `lafermeamadichelle.web.app`, `lafermeamadichelle.firebaseapp.com`, `cocobomp.github.io` |
| URI de redirection du client OAuth (Google Cloud) | ⚠️ à compléter | Seule `https://lafermeamadichelle.firebaseapp.com/__/auth/handler` est autorisée. Il manque `https://lafermeamadichelle.web.app/__/auth/handler`, nécessaire pour l'appli ajoutée à l'écran d'accueil (voir « Connexion Google » plus bas) |
| Règles de sécurité de la synchro v2 (`rev`, `gen`) | ✅ mises en ligne le 17 octobre 2026, avant la v2 | Voir « Mettre les règles en ligne » plus bas (à refaire à chaque changement de `firestore.rules`) |
| Base des sauvegardes | ✅ créée à **Zurich** (`europe-west6`) | Une partie = un document `users/<compte>/saves/<partie>` |
| Règles de sécurité | ✅ en ligne (fichier `firestore.rules` du dépôt) | Chaque compte ne lit et n'écrit que ses propres parties ; sans compte, rien ; taille limitée |
| Règles des avis des joueurs (`feedback`) | ⚠️ à publier à la main | Tant qu'elles ne sont pas en ligne, les avis restent sur les appareils et repartent plus tard (voir « Les avis des joueurs ») |
| Un mail à chaque avis | ⚠️ à installer (une fois, 5 minutes) | Un petit script Google dans le compte propriétaire du projet, gratuit (voir « Recevoir un mail à chaque avis ») |
| Hébergement | ✅ en ligne | https://lafermeamadichelle.web.app |
| Mise en ligne automatique depuis GitHub | ✅ à chaque mise à jour de `main` | Sans clé : GitHub prouve à Google que c'est ce dépôt (Workload Identity Federation) |

### Comptes de service du projet (https://console.cloud.google.com/iam-admin/serviceaccounts?project=lafermeamadichelle)

| Compte | À quoi il sert | Faut-il le garder ? |
|---|---|---|
| `firebase-adminsdk-fbsvc@…` | Créé automatiquement par Firebase | Oui, ne pas y toucher |
| `github-deploy@…` | Mettre le jeu en ligne depuis GitHub. Rôle limité : **Firebase Hosting Admin** (et lecture des services activés). Ne peut ni lire ni modifier les sauvegardes. Seul le dépôt `cocobomp/Animaleana`, branche `main`, peut l'utiliser | Oui |
| `claude-temporaire@…` | Mise en place faite par Claude (rôle Propriétaire) | **Non : à supprimer** dès que la mise en ligne automatique a marché une fois |

Le lien GitHub ↔ Google : *IAM → Workload Identity Federation*, groupe `github`, fournisseur `animaleana`
(https://console.cloud.google.com/iam-admin/workload-identity-pools?project=lafermeamadichelle).

## Connexion Google : quelle page de connexion, et le réglage qui manque

Le jeu ouvre la page de connexion de Google de deux façons (code : `src/cloud/firebase.js`) :

- **Partout (ordinateur, téléphone dans le navigateur, ancienne adresse github.io)** : une fenêtre (popup)
  servie par `https://lafermeamadichelle.firebaseapp.com/__/auth/handler`. Cette adresse est déjà autorisée :
  rien à faire.
- **Seulement dans l'appli ajoutée à l'écran d'accueil, ouverte sur https://lafermeamadichelle.web.app** :
  une fenêtre ne peut pas revenir dans l'appli, on passe donc par une redirection servie par le jeu lui-même,
  `https://lafermeamadichelle.web.app/__/auth/handler`. **Cette adresse doit être ajoutée au client OAuth**,
  sinon Google répond « Erreur 400 : redirect_uri_mismatch » :

1. Ouvrir https://console.cloud.google.com/apis/credentials?project=lafermeamadichelle
2. Sous « ID clients OAuth 2.0 », cliquer sur **Web client (auto created by Google Service)**
   (identifiant `612724115048-0eooua2ho8eeu5spasqeolt5r839q02d.apps.googleusercontent.com`).
3. Dans **URI de redirection autorisés**, cliquer sur **+ Ajouter un URI** et coller
   `https://lafermeamadichelle.web.app/__/auth/handler` (garder celui de firebaseapp.com).
4. Dans **Origines JavaScript autorisées**, vérifier que `https://lafermeamadichelle.web.app` y est (l'ajouter sinon).
5. **Enregistrer**, attendre quelques minutes, puis vérifier dans un terminal (le résultat ne doit plus contenir
   `/signin/oauth/error`) :
   `curl -s -o /dev/null -w '%{redirect_url}\n' 'https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&client_id=612724115048-0eooua2ho8eeu5spasqeolt5r839q02d.apps.googleusercontent.com&redirect_uri=https://lafermeamadichelle.web.app/__/auth/handler&scope=openid&nonce=x'`

Tant que ce n'est pas fait, la connexion marche partout sauf dans l'appli de l'écran d'accueil (iPhone, iPad).

## Synchro des parties (version 2) : ce qu'il faut savoir

Code : `src/sim/cloudSync.js` (les décisions), `src/cloud/sync.js` (les appliquer), `src/cloud/account.js`
(quand), `firestore.rules` (ce que la base accepte). Principe : **aucune partie n'est jamais perdue ni écrasée
en silence**.

- Chaque document en ligne a un numéro de version `rev` (1 à la création, +1 à chaque écriture) et une
  identité `gen` (tirée au hasard à la création, jamais changée ensuite). Les règles refusent une écriture qui
  ne fait pas exactement `rev + 1` ou qui change `gen`, et le jeu écrit dans une transaction qui relit `rev` et
  `gen` juste avant : deux appareils qui écrivent en même temps ne s'écrasent pas, le second recommence. Une
  partie effacée en ligne puis remise dans le compte repart en `rev` 1, mais avec un autre `gen` : un appareil
  qui avait noté « rev 1 » voit qu'elle a changé.
- Les horloges des appareils ne décident de rien : le jeu regarde seulement ce qui a changé depuis le dernier
  accord (de chaque côté). Si les deux côtés ont changé, **les deux versions sont gardées** : la plus récente
  reste la partie, l'autre devient une copie de secours sur l'appareil (« Léa · secours 17/10 »).
- Écriture sans réponse (réseau très lent, coupure juste après l'envoi) : elle a peut-être eu lieu. Le jeu garde
  alors la copie de secours qu'il venait de faire (au pire un doublon, jamais une perte) et ne dit pas
  « Sauvegardé » ; la synchro suivante reconnaît sa propre version.
- Une partie ouverte (dans cet onglet ou un autre) n'est jamais remplacée ni effacée pendant qu'on joue, et ne
  s'ouvre pas dans un deuxième onglet.
- Sur une tablette partagée, la première connexion demande quelles parties mettre dans le compte (les autres
  restent sur l'appareil). Une petite ☁️ marque les parties du compte connecté. Une partie liée à un autre
  compte (par exemple un compte supprimé) peut aussi être mise dans le sien (« ☁️ Mettre dans mon compte »,
  avec confirmation). Si le même compte Google revient avec un autre identifiant (compte du jeu supprimé depuis
  un autre appareil), ses parties de l'appareil sont reproposées à la question.
- Effacer une partie liée au compte connecté l'efface sur tous ses appareils ; sinon, seulement sur l'appareil
  (la confirmation dit si des progrès faits depuis la dernière synchro seront perdus).
- Pierre tombale (partie effacée par son propriétaire) : `{ data: '', gone: true }`. Pas `deleted` : c'est le
  champ que la v1 lisait pour effacer sans regarder ; un appareil resté en v1 ne voit dans une pierre tombale v2
  qu'une partie illisible et n'efface rien.
- « 🔒 Mes données en ligne » (encart du compte) : « Effacer mes parties en ligne » supprime les documents du
  compte (les parties restent sur l'appareil) ; « Supprimer mon compte » supprime aussi le compte Google du jeu.

### Mettre les règles en ligne (à faire avant de publier la v2)

La v2 écrit les champs `rev` et `gen` : avec les anciennes règles, ses écritures seraient refusées. L'action GitHub ne
publie que les fichiers du jeu (pas les règles). Avant de fusionner la v2 dans `main` :

1. Vérifier le fichier `firestore.rules` du dépôt.
2. Le mettre en ligne : `npx firebase-tools deploy --only firestore:rules --project lafermeamadichelle`
   (avec un compte qui a le droit de modifier les règles), ou le coller dans
   https://console.firebase.google.com/project/lafermeamadichelle/firestore/rules puis **Publier**.

Les anciennes versions du jeu (encore en cache sur un appareil) ne peuvent alors plus écrire : elles affichent
« Le compte ne répond pas » jusqu'à leur mise à jour, sans rien perdre.

### Tester avec les émulateurs (sur un ordinateur)

1. `npx firebase-tools emulators:start --only auth,firestore` (un `firebase.json` d'émulateurs qui pointe vers
   `firestore.rules` ; ports par défaut : auth 9099, Firestore 8080).
2. Règles et synchro avec le vrai SDK :
   `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run tests/firestoreRules.test.js tests/cloudEmulator.test.js`
   (sans cette variable, ces tests sont sautés).
3. Dans le jeu (`npx vite`, mode développement seulement) : dans la console du navigateur,
   `localStorage.setItem('animaleana.cloud.emulator', '127.0.0.1:9099:8080')` (« hôte » seul = ports 9099 et 8089),
   puis recharger : la connexion et la synchro passent par les émulateurs.

## 💌 Les avis des joueurs

Dans le jeu en ligne, « 💌 Ton avis » (menu ⋯ Plus, ⚙️ Réglages et écran des profils) : un smiley (😍 🙂 😐 😕), une
sorte (idée, bug, j'aime, autre) et un petit texte. Code : `src/cloud/feedback.js` (le message, l'envoi, la file d'attente),
`src/ui/feedbackWindow.js` (la fenêtre), `firestore.rules` (ce que la base accepte), tests `tests/feedback.test.js` et
`tests/firestoreRules.test.js`.

**Les lire** : console Firestore, collection `feedback` :
https://console.firebase.google.com/project/lafermeamadichelle/firestore/databases/-default-/data/~2Ffeedback
(ou https://console.firebase.google.com/project/lafermeamadichelle/firestore → `feedback`). Un avis = un document,
`createdAt` dit quand il est arrivé. Le jeu ne peut ni les relire ni les effacer : une fois lus, on les efface dans la
console (sélectionner le document → **Supprimer le document**).
Ou les recevoir par mail, au plus une fois par heure : voir « 📧 Recevoir un mail à chaque avis » plus bas.

**Publier les règles (une fois, à la main)** : l'action GitHub ne publie que les fichiers du jeu, pas les règles.
Tant que les règles avec `feedback` ne sont pas en ligne, la base refuse les avis : le jeu les garde sur l'appareil
(20 au plus) et les renvoie au démarrage suivant ou quand le réseau revient. Rien ne se perd, et l'enfant voit
« Merci ! Il partira dès que possible 💌 ». (Stockage de l'appareil plein ou bloqué : l'avis attend en mémoire tant
que le jeu est ouvert, et passe dans le stockage dès qu'il y a de nouveau de la place.) Pour les publier (un compte qui a le droit de modifier les règles) :

    npx firebase-tools deploy --only firestore:rules --project lafermeamadichelle

(ou coller le fichier `firestore.rules` dans https://console.firebase.google.com/project/lafermeamadichelle/firestore/rules
puis **Publier**). Les règles des sauvegardes ne changent pas.

**Ce qui est stocké** (exactement ces champs, les règles refusent tout le reste) :

| Champ | Contenu |
|---|---|
| `text` | Le message, 500 caractères au plus. Les adresses e-mail, les numéros de téléphone et les noms des profils de l'appareil y sont remplacés par `[e-mail]`, `[téléphone]` et `[prénom]` avant de partir (le nom entier et chacun de ses mots : un profil « Léa Dupont » masque aussi « Léa » et « Dupont ») |
| `mood` | `love` 😍, `happy` 🙂, `meh` 😐, `sad` 😕, ou `none` (pas de smiley : il y a alors un texte) |
| `kind` | `idea` (idée), `bug`, `like` (j'aime) ou `other` (autre, ou rien de choisi) |
| `lang`, `version` | Langue du jeu (`fr`, `en`) ; version et commit (par exemple `0.5.0+cb4307f`) |
| `device`, `orientation` | `phone`, `tablet` ou `computer` ; `portrait` ou `landscape` |
| `mode`, `level`, `day` | `sandbox` (bac à sable), `manage` (gestion) ou `none` (écran des profils) ; niveau ; jour du jeu |
| `place`, `screen` | Le lieu du jeu (`maison`, `japon`…, et le bâtiment : `maison/stable`) ; ce qui était ouvert (`panel:animal`, `panel:settings`, `ride`, `activity:trail`, `map`, `build`, `profiles`…) |
| `createdAt` | L'heure d'arrivée (celle du serveur, jamais celle de l'appareil) |

**Pourquoi rien de personnel** : ni prénom, ni identifiant de partie, ni compte Google (pour un avis, Firebase est
chargé SANS la connexion : la base ne sait pas qui écrit, même si l'enfant est connecté), ni e-mail. Le jeu ne
garde pas l'adresse IP (Google la voit pour répondre, comme pour toute page web, mais elle n'est pas dans le
document). La fenêtre rappelle « N'écris pas ton nom, ton adresse ni ton téléphone 🙂 », et le texte est nettoyé.

**Limites** : sur l'appareil, 30 s entre deux avis et 5 par jour. Les règles bornent chaque document (champs, listes,
tailles) mais pas leur nombre : comme tout formulaire sans compte, quelqu'un pourrait en écrire beaucoup en dehors
du jeu. En cas d'abus : fermer la collection (`allow create: if false;` dans `firestore.rules`, puis publier), ou
ajouter App Check.

**Version « à emporter » (fichier)** : « 💌 Ton avis » n'y est pas proposé (comme le compte Google) : elle ne se
connecte jamais à Internet et son stockage n'est pas celui du site, un avis n'en partirait jamais.

## 📧 Recevoir un mail à chaque avis

Plutôt que d'aller voir la console : un petit script Google, collé **une fois** dans ton compte Google, regarde toutes
les heures s'il y a de nouveaux avis et t'envoie **un** mail qui les récapitule. Rien de neuf : pas de mail. Code :
`tools/avis-mail/Code.gs` et `tools/avis-mail/appsscript.json` ; tests : `tests/avis-mail.test.js`.

- **Gratuit**, sans plan Blaze ni carte bancaire : le script tourne chez Google (Apps Script), le mail part de ton Gmail
  vers toi-même. Chaque passage compte au moins une lecture dans Firestore (même quand il n'y a rien) : 24 par jour,
  loin des 50 000 lectures gratuites par jour. Au plus 24 mails par jour (Gmail en permet 100 à un script).
- **Rien dans le dépôt** : ni mot de passe, ni clé, ni adresse e-mail. Le script lit les avis avec tes droits Google de
  propriétaire du projet, comme la console ; les règles de `firestore.rules` (« personne ne relit les avis ») ne valent
  que pour le jeu.
- **Il ne fait que lire** : il n'écrit, ne change ni n'efface rien dans la base.

**D'abord** : les règles avec `feedback` doivent être publiées (« Publier les règles », plus haut). Sinon, aucun avis
n'arrive dans la base, et donc aucun mail.

**L'installer** (une fois, sur un ordinateur, 5 minutes) :

1. Ouvrir https://script.google.com avec le **compte Google propriétaire du projet Firebase** (celui qui ouvre
   https://console.firebase.google.com/project/lafermeamadichelle). Si plusieurs comptes Google sont ouverts, vérifier
   la photo en haut à droite.
2. **Nouveau projet** (en haut à gauche). Cliquer sur « Projet sans titre » et l'appeler `Avis de la ferme`.
3. Dans le fichier `Code.gs` déjà ouvert, tout effacer (`function myFunction() { }`), puis coller **tout** le fichier
   [`tools/avis-mail/Code.gs`](../tools/avis-mail/Code.gs) du dépôt (sur GitHub : ouvrir le fichier, puis le bouton
   « Copy raw file », deux petits carrés, en haut à droite du code).
4. ⚙️ **Paramètres du projet** (roue dentée, dans la barre de gauche) → cocher **Afficher le fichier manifeste
   « appsscript.json » dans l'éditeur**. Revenir à l'**Éditeur** (`< >`, barre de gauche), cliquer sur
   `appsscript.json`, tout effacer et coller le fichier [`tools/avis-mail/appsscript.json`](../tools/avis-mail/appsscript.json)
   (l'heure suisse et la liste exacte des autorisations).
5. **Enregistrer** (l'icône 💾, ou Ctrl+S, Cmd+S sur Mac).
6. En haut, dans la liste des fonctions (à droite de « Déboguer »), choisir `installer`, puis **Exécuter**.
7. **Autoriser** (la première fois seulement) : « Autorisation nécessaire » → **Examiner les autorisations** → choisir
   son compte. Google affiche alors **« Google n'a pas validé cette application »** : c'est normal, c'est **ton propre
   script** (Google le dit de tout script personnel : sa vérification est faite pour les applications publiques).
   Cliquer sur **Paramètres avancés** (en bas à gauche), puis **Accéder à Avis de la ferme (non sécurisé)**. Accepter
   ensuite les autorisations (s'il y a des cases à cocher : **Tout sélectionner**) → **Continuer** / **Autoriser**.
   Ce que chacune permet (les mots exacts de Google peuvent changer un peu) :

   | Autorisation | Pour quoi faire |
   |---|---|
   | Afficher et gérer vos données dans Google Cloud Datastore | Lire les avis (Firestore n'a pas d'autorisation « lecture seule » ; le script, lui, ne fait que lire) |
   | Se connecter à un service externe | Parler à Firestore (`firestore.googleapis.com`, la seule adresse appelée) |
   | Envoyer des e-mails en votre nom | Le mail, à toi seulement |
   | Autoriser l'application à s'exécuter en votre absence | Le passage toutes les heures |
   | Voir votre adresse e-mail principale | Savoir à qui envoyer le mail : à toi |

8. En bas, le **Journal d'exécution** dit « Installé : les avis seront vérifiés toutes les heures. », puis « 2 nouveaux
   avis : mail envoyé. » ou « Aucun nouvel avis : pas de mail. ». Une ligne rouge « Installé, mais la lecture des avis
   ne marche pas encore… » : voir « Si ça ne marche pas » plus bas.
9. Choisir `essai` → **Exécuter** : un mail « ✅ La ferme à Madichelle : mail d'essai » arrive dans ta boîte. Il dit si
   la lecture des avis marche et si le passage horaire est bien installé.

**Ce que tu reçois** : au plus un mail par heure, seulement quand il y a de nouveaux avis. Sujet « 💌 La ferme à
Madichelle : 2 nouveaux avis » ; pour chaque avis, le smiley, la sorte (💡 idée, 🐞 bug, ❤️ j'aime, ✉️ autre), le
texte de l'enfant, la langue, l'appareil, la version du jeu, le mode, le niveau et le jour du jeu, le lieu, ce qui
était ouvert, l'heure d'arrivée (heure suisse) et un lien vers l'avis dans la console. Le tout premier mail contient
les avis déjà dans la base. 50 avis au plus par mail : la suite arrive l'heure suivante. Le texte des enfants est
montré tel quel, mais rien de ce qu'ils écrivent ne peut devenir une mise en forme ou un lien dans le mail.

**Si ça ne marche pas** : le script réessaie toutes les heures sans rien perdre (les avis attendent dans la base et
arrivent dans le mail suivant). Après 6 heures d'échecs de suite, **un seul** mail « ⚠️ La ferme à Madichelle : les
avis ne peuvent plus être lus », avec l'erreur ; plus d'alerte ensuite tant que ça ne remarche pas.

- Erreur 403, `PERMISSION_DENIED` : le script ne tourne pas avec le compte propriétaire du projet Firebase, ou une
  autorisation a été refusée. Recommencer avec le bon compte, ou relancer `installer` (il redemande les autorisations).
- Le détail de chaque passage : barre de gauche → **Exécutions**.

**L'arrêter** : choisir `desinstaller` → **Exécuter** (plus de passage, plus de mail). Le script se souvient du dernier
avis envoyé : relancé plus tard avec `installer`, il reprend là où il s'était arrêté (les avis arrivés entre-temps
viennent dans le premier mail). Pour tout enlever : supprimer le projet dans https://script.google.com, puis retirer
son accès dans https://myaccount.google.com/permissions (« Avis de la ferme » → **Supprimer l'accès**).

**Le mettre à jour** (si `tools/avis-mail/Code.gs` change dans le dépôt) : recoller le fichier dans `Code.gs` et
enregistrer ; le passage horaire continue tout seul. Si `appsscript.json` change aussi, le recoller et relancer
`installer` (pour accepter une nouvelle autorisation).

Les avis lus restent dans la base : les effacer dans la console se fait toujours à la main.

## Mise en ligne automatique

À chaque mise à jour de `main`, l'action « Publier le jeu (Firebase) » teste, construit et met le jeu en
ligne sur https://lafermeamadichelle.web.app (fichier `.github/workflows/firebase.yml`). Suivi :
https://github.com/cocobomp/Animaleana/actions . Pour l'arrêter : désactiver l'action dans cet onglet
(bouton « … » → *Disable workflow*).

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

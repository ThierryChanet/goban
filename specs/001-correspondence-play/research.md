# Phase 0 — Recherche : partie par correspondance

Chaque décision suit le format *Décision / Justification / Alternatives écartées*.

## R1. Où conserver les parties en correspondance

**Constat préalable** : en production, l'application tourne sur le plan gratuit de Render.
Le disque de ce plan est **éphémère** : il est effacé à chaque redéploiement et à chaque
redémarrage. De plus, le service **s'endort après 15 minutes sans visite**, ce qui vide
la mémoire. Aujourd'hui, une partie meurt donc en pratique dès que personne ne la
regarde pendant 15 minutes. Garder les parties en mémoire ou sur le disque local ne
suffit pas en production.

**Décision** (Postgres/Neon validé par l'utilisateur, 2026-10-13) : une interface `RoomRepository` dans `src/server/storage/`, avec deux implémentations :

1. **`FileRoomRepository`** (implémentation par défaut). Un fichier JSON par partie dans `DATA_DIR` (par défaut `./data`). L'écriture est atomique : on écrit un fichier temporaire, puis on le renomme. Cette implémentation sert au développement local, aux tests, et à Docker ou Fly.io avec un volume monté.
2. **`PostgresRoomRepository`**, activée dès que `DATABASE_URL` est défini. Une table `rooms (id text primary key, data jsonb, updated_at timestamptz)` et une table `settings (key text primary key, value text)`. Elle sert à la production sur Render gratuit, avec une base Postgres gratuite externe : Neon, sans expiration. La base Postgres gratuite de Render expire au bout de 30 jours et ne convient donc pas.

**Justification** : un seul processus, quelques centaines de parties de quelques ko,
aucune requête complexe. Un stockage clé → document suffit. L'interface permet de
garder des tests rapides (fichier ou mémoire) et de rester déployable sur le plan
gratuit.

**Alternatives écartées** :

- `node:sqlite` : expérimental en Node 22, et il a besoin d'un disque persistant, donc du même problème que le fichier.
- Redis (Upstash) : possible, mais il faut un client de plus, et les documents JSON s'accommodent aussi bien de Postgres.
- Disque persistant Render : il exige un plan payant (environ 7 $/mois), et le plan gratuit est un choix explicite du README.

**Conséquence de déploiement** : `render.yaml` déclare `DATABASE_URL` en `sync: false`.
L'utilisateur colle l'URL Neon une fois, depuis le tableau de bord. Sans `DATABASE_URL`
sur Render, l'application démarre quand même, avec le stockage fichier, mais un
avertissement au démarrage signale que les parties ne survivront pas au redémarrage.

## R2. Format de sauvegarde d'une partie

**Décision** : sérialiser l'état exact de `GoGame` avec `toRecord()` / `GoGame.fromRecord()`,
dans `src/shared/game.ts`. On sauvegarde le plateau, le trait, les prisonniers, le
dernier coup, le numéro de coup, les passes, la phase, l'historique complet, les
pierres mortes, les confirmations, le résultat et la **pile d'annulation**.

L'ensemble des positions déjà vues, qui sert au super-ko, n'est pas stocké : on le
reconstruit à partir de la position initiale et des `addedPosition` de la pile
d'annulation. C'est exact, parce qu'une position n'est ajoutée que par `play` et
n'est retirée que par `undo` de cette même entrée. Le score d'une partie terminée au
comptage est recalculé à partir des pierres mortes.

**Justification** : la restauration est **exacte** par construction, ko, annulation et
passes compris. Le volume reste petit : au pire environ 110 ko pour 300 coups en
19x19, et quelques ko en 9x9.

**Alternative écartée** : rejouer la liste des coups. Cette approche est plus
compacte, mais elle diverge sur des cas réels. Par exemple, une passe, puis une
demande de comptage, puis une reprise remet `passes` à 0 dans la partie, alors que le
simple rejeu laisse `passes` à 1. La passe suivante ouvrirait alors le comptage à tort.

## R3. Quand écrire, quand charger, quand supprimer

**Décision** :

- **Écriture** : après chaque action acceptée qui modifie une partie en correspondance (coup, passe, annulation, comptage, marquage, validation, abandon, revanche, prise de place, changement de nom, abonnement aux notifications). Les écritures d'une même partie passent par une file, pour qu'une écriture lente ne soit jamais doublée par une plus ancienne. Un échec d'écriture est journalisé et la partie continue en mémoire ; on ne fait pas de retour arrière.
- **Chargement** : au démarrage, toutes les parties en correspondance non expirées sont chargées en mémoire (quelques centaines de documents au plus). Le reste du code serveur reste synchrone, comme aujourd'hui.
- **Expiration** : le balayage existant (toutes les 15 minutes) supprime une partie en correspondance de la mémoire **et** du stockage quand sa dernière activité de jeu date de plus de 30 jours. Une partie terminée est supprimée 30 jours après la fin. Une simple connexion sans action ne compte pas comme une activité. Les parties en mode direct gardent la règle actuelle (6 h sans connexion) et ne sont jamais écrites.

**Alternative écartée** : charger une partie seulement quand on la demande. Le code
serveur deviendrait asynchrone partout, pour un gain mémoire négligeable à cette échelle.

## R4. Notifications « à vous de jouer »

**Décision** : utiliser **Web Push** (VAPID) avec la bibliothèque `web-push` côté serveur,
plus un **service worker** (`/sw.js`) et un **manifeste web** côté client.

- **Clés VAPID** : elles sont lues dans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. À défaut, elles sont générées au premier démarrage, puis conservées dans le stockage (`settings`), pour qu'elles restent stables d'un redémarrage à l'autre. Si elles changent, tous les abonnements sont perdus.
- **Abonnement par partie et par place** : le navigateur fournit un abonnement (`endpoint` + clés), que le client envoie au serveur pour la place qu'il occupe. Quand le joueur a activé les alertes « pour toutes mes parties », le client renvoie automatiquement son abonnement à chaque partie qu'il ouvre.
- **Envoi** : après une action d'un joueur, le serveur prévient l'**adversaire**, si aucune connexion de celui-ci n'est ouverte sur cette partie. C'est le cas pour un coup, une passe, une annulation, une demande ou un refus de comptage, un abandon, une validation de comptage, une proposition de revanche ou l'arrivée de l'adversaire. Les envois sont regroupés : une seule notification par place et par fenêtre de 30 s, qui reflète l'état final. Un coup suivi d'une annulation produit donc une seule notification.
- **Contenu** : titre « Go — à vous de jouer » ou « Go — {nom} a passé », dans la langue enregistrée avec l'abonnement. `tag` = `go-{roomId}`, pour qu'une nouvelle notification remplace l'ancienne. Toucher la notification ouvre ou met au premier plan `/?g={roomId}`.
- **Nettoyage** : un abonnement auquel le service de push répond 404 ou 410 est supprimé.
- **iPhone** : le push web n'y fonctionne que si l'application a été ajoutée à l'écran d'accueil, ce qui demande un manifeste avec `display: standalone`. L'écran d'activation le détecte (`navigator.standalone` faux, ou `PushManager` absent) et affiche la marche à suivre.

**Justification** : c'est le canal retenu par la spec (Q1 → A). Il fonctionne sans compte
ni adresse, et `web-push` est la bibliothèque de référence, sans dépendance native.

**Alternative écartée** : implémenter soi-même le chiffrement du push (RFC 8291) et la
signature VAPID. C'est faisable avec `node:crypto`, mais long et facile à rater.

**Plan gratuit Render** : le service peut dormir, mais une notification n'est envoyée
qu'au moment où l'adversaire joue. Le service est donc réveillé à ce moment-là, et
l'endormissement ne pose pas de problème.

## R5. Changement d'appareil

**Constat** : le jeton actuel (`go:token`) est **unique par appareil**. Un nouvel appareil
n'a donc aucune place dans la partie, et arrive en spectateur.

**Décision** (choix de l'utilisateur, 2026-10-13) : pas de lien secret. Les parties se
jouent à deux, entre personnes qui se connaissent. Quand un appareil sans place ouvre
une partie en correspondance dont les deux places sont prises, le client affiche
« Qui êtes-vous ? Noir (nom) / Blanc (nom) / Juste regarder ». Le choix envoie
`claimSeat { color }`, et le serveur **ajoute** le jeton de l'appareil à la liste des
jetons de cette place. Une place peut donc avoir plusieurs appareils, et chacun garde le
sien. Un bouton « Je suis un joueur » reste disponible sur l'écran de spectateur.

**Risque accepté** : quiconque a le lien peut se déclarer joueur. Le lien n'est partagé
qu'entre les deux joueurs.

**Alternatives écartées** :

- Lien personnel secret par place : plus sûr, mais un concept de plus à expliquer, pour un usage à deux joueurs qui se font confiance.
- Remplacer le jeton de la place par celui du nouvel appareil : l'ancien appareil perdrait sa place, ce qui serait déroutant.

## R6. « Reprendre la partie en cours »

**Décision** (choix de l'utilisateur, 2026-10-13) : une seule partie à la fois. Le client
garde dans `localStorage` (`go:current`) le code de la dernière partie où il a pris
place (à la création, à l'arrivée sur une place libre, ou après « Qui êtes-vous ? »). Sur
l'accueil, il envoie `peekGame { token, roomId }`. Le serveur répond `peek` avec un
résumé si ce jeton est assis dans cette partie et qu'elle n'est pas terminée, sinon
`null`, et le client efface alors `go:current`.

**Justification** : il n'y a ni compte ni index par joueur à maintenir, et un seul
raccourci suffit pour un usage à deux.

**Alternative écartée** : la liste « Mes parties » à plusieurs entrées, jugée superflue.

## R7. Annulation en correspondance

**Décision** : on garde le moteur tel quel (`GoGame.undo()` annule le dernier coup, quel
qu'en soit l'auteur). On ajoute une **règle de salle** : en correspondance, `undo` n'est
accepté que si le dernier coup ou la dernière passe de l'historique appartient au
demandeur. Sinon, le serveur renvoie la nouvelle erreur `undo_not_allowed`.
L'instantané expose déjà `history`, et le client désactive le bouton selon la même règle.

## R8. Mode par défaut et mode mémorisé

**Décision** : un nouveau sélecteur segmenté **Correspondance / Direct** en tête du
formulaire de création. Valeur initiale : la dernière valeur choisie sur l'appareil
(`go:mode`), sinon `correspondence`. Le mode est envoyé dans `create`, et la revanche
garde le mode de la salle, puisqu'elle reste la même salle.

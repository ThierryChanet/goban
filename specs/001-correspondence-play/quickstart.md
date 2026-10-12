# Quickstart — valider la partie par correspondance

## Prérequis

- Node 22 ou plus, puis `npm install`.
- Les notifications demandent un contexte sécurisé : `localhost` suffit sur ordinateur. Pour un téléphone, il faut une URL https, par exemple un déploiement de test.
- Facultatif : une base Postgres, avec `DATABASE_URL=postgres://…`.

## 1. Vérifications automatiques

```bash
npm test          # moteur, salles, persistance, protocole
npm run typecheck
```

Les nouvelles suites doivent couvrir :

- `GoGame.toRecord` / `fromRecord`, avec un instantané identique et le même comportement ensuite (ko, annulation, passe → comptage → reprise) ;
- `FileRoomRepository`, avec une écriture atomique, une relecture et une suppression ;
- les règles de salle : mode par défaut, clé de place, annulation restreinte, `listGames`, expiration à 30 jours ;
- le regroupement des notifications : une seule par fenêtre de 30 s, pas d'envoi si l'adversaire est connecté, purge sur 410.

## 2. Partie en différé et redémarrage (US1, SC-001, SC-002)

```bash
npm run build && npm start      # http://localhost:8787, stockage dans ./data
```

1. Onglet A : créer une partie en 9x9 sans toucher au mode. Le mode « Correspondance » est affiché.
2. Copier le lien d'invitation, puis l'ouvrir dans une **fenêtre privée** (onglet B), qui prend Blanc.
3. A joue un coup, puis on ferme les deux onglets.
4. Arrêter le serveur (Ctrl+C) et le relancer avec `npm start`.
5. Rouvrir B avec le lien : le coup de A est là, et c'est à Blanc de jouer.
6. Pour simuler 7 jours d'inactivité, utiliser le test automatisé dédié, qui avance l'horloge.

Résultat attendu : la partie est identique (plateau, prisonniers, trait, « Dernier coup il y a … »).

## 3. Annulation restreinte (FR-006)

En correspondance, B ne peut pas annuler le coup de A : le bouton est désactivé, et
le serveur répond `undo_not_allowed` si on force l'envoi. A peut annuler son propre
coup tant que B n'a pas joué. Une partie en mode **Direct** garde l'ancien comportement.

## 4. Mes parties (US2, SC-003)

Créer 3 parties depuis A, jouer dans deux d'entre elles depuis B, puis revenir à
l'accueil de A. La liste affiche les 3 parties, avec « À vous de jouer » en tête. Un
toucher ouvre la partie à sa place.

## 5. Lien personnel (FR-010, SC-005)

Dans la partie, ouvrir « Mon lien personnel » et l'ouvrir dans un autre navigateur. On
retrouve sa couleur et l'on peut jouer, et le paramètre `k` disparaît de la barre
d'adresse. L'adversaire ne voit jamais ce lien.

## 6. Notifications (US3, SC-004)

1. Dans A, activer « Me prévenir quand c'est à moi » et accepter l'autorisation du navigateur.
2. Fermer l'onglet A.
3. B joue un coup. En moins de quelques secondes, A reçoit « Go — à vous de jouer ».
4. Toucher la notification ouvre la partie.
5. Avec A ouvert et visible, aucune notification n'est affichée.

Sur iPhone : sans ajout à l'écran d'accueil, l'écran d'activation explique la marche
à suivre au lieu d'échouer silencieusement.

## 7. Non-régression du mode Direct (SC-006)

Créer une partie en choisissant **Direct**. Reconnexion, revanche, annulation et
comptage se comportent comme avant, et aucune écriture n'a lieu dans `./data`.

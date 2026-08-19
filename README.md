# Go — partie a deux, chacun sur son ecran

Application web pour jouer au Go a deux joueurs distants : l'un cree la partie, envoie
un lien (ou dicte un code a 5 caracteres), l'autre le rejoint. Le serveur arbitre les
regles, les deux ecrans restent synchronises et une partie survit a un rechargement de
page ou a une perte de reseau passagere.

Interface **bilingue francais / anglais** (bouton `FR / EN`), pensee **d'abord pour le
telephone** : goban plein ecran, pose de pierre en deux temps (viser puis confirmer)
pour eviter les coups partis tout seuls, boutons larges, aucune dependance au survol.

## Ce que le jeu propose

| Reglage | Valeurs |
| --- | --- |
| Taille du goban | 9x9, 13x13, 19x19 |
| Handicap | aucun, ou 2 a 9 pierres placees sur les hoshi |
| Komi | libre, par demi-point (6,5 par defaut, 0,5 avec handicap) |
| Qui commence | Noir, Blanc (impose a Blanc des qu'il y a handicap) |
| Votre couleur | Noir, Blanc ou au hasard |

Regles appliquees par le serveur :

- captures par libertes, suicide interdit ;
- **super-ko positionnel** : aucune position deja apparue ne peut etre recreee (couvre
  le ko simple et les triples ko) ;
- passe, abandon ;
- bouton **Compter les points** : arrete la partie en l'etat et ouvre directement le
  comptage, sans passer par deux passes. Ce n'est pas un abandon et ce n'est pas
  unilateral : l'adversaire peut refuser, et la partie repart exactement ou elle en
  etait ;
- deux passes consecutives ouvrent aussi la **phase de comptage** : chacun touche les groupes
  morts pour les retirer, et les deux joueurs doivent valider. Un joueur peut refuser et
  reprendre la partie ;
- **comptage chinois (surface)** : pierres vivantes + intersections entourees par un seul
  camp, plus le komi pour Blanc. Le territoire est colorie sur le goban en fin de partie ;
- revanche en un clic, avec echange des couleurs et memes reglages.

Ne sont volontairement pas inclus (perimetre MVP) : pendules, import/export SGF, chat,
salon de spectateurs. Une troisieme personne qui ouvre le lien voit la partie sans
pouvoir jouer.

## Lancer en local

```bash
npm install
npm run dev
```

Le client est servi par Vite sur <http://localhost:5173> et parle au serveur de jeu sur
le port 8787. Ouvrez deux onglets (ou un onglet et votre telephone sur le meme reseau
Wi-Fi, via `http://<ip-de-la-machine>:5173`) pour jouer les deux couleurs.

Version compilee, un seul processus qui sert tout :

```bash
npm run build
npm start          # http://localhost:8787
```

## Tests

```bash
npm test           # regles du jeu, comptage, handicap, gestion des salles
npm run typecheck
```

Les tests couvrent notamment les captures multiples, le suicide, la reprise de ko, le
comptage avec pierres mortes, le placement des pierres de handicap, la reconnexion d'un
joueur et l'echange des couleurs a la revanche.

## Mettre en ligne

L'application est un seul service Node : il sert les fichiers statiques **et** le
websocket sur le meme port, il n'y a donc rien a configurer cote CORS ou proxy. Le port
d'ecoute est lu dans la variable d'environnement `PORT`.

- **Render (le plus simple, faisable depuis un telephone)** — le fichier `render.yaml`
  est a la racine du depot. Sur <https://dashboard.render.com/blueprints> : *New Blueprint
  Instance*, choisir ce depot, *Apply*. Tout est deja renseigne. Le plan gratuit met le
  service en veille apres 15 minutes sans visite : la premiere connexion suivante prend
  une trentaine de secondes, les suivantes sont instantanees.
- **Fly.io / Railway / Docker** — un `Dockerfile` est fourni :
  `docker build -t go-game . && docker run -p 8787:8787 go-game`.
- **Heroku et compatibles** — un `Procfile` est fourni.

Sonde de sante : `GET /health` renvoie `{"ok":true,"rooms":n,"uptime":s}`.

## Comment c'est fait

```
src/
  shared/     regles du jeu, partagees mot pour mot entre le serveur et le navigateur
    goban.ts      plateau, groupes, libertes, captures, suicide
    game.ts       machine a etats d'une partie (coups, passes, comptage, resultat)
    scoring.ts    comptage chinois et propriete des intersections
    handicap.ts   points hoshi et ordre de placement
    protocol.ts   messages echanges sur le websocket
  server/
    rooms.ts      salles, places, reconnexion, revanche
    index.ts      serveur HTTP (fichiers statiques) + websocket
  client/
    board.ts      rendu du goban sur canvas
    net.ts        connexion websocket avec reconnexion automatique
    i18n.ts       traductions FR / EN
    main.ts       ecrans, interactions, rendu
tests/          suite Vitest
```

Choix notables :

- **le serveur fait autorite** : le navigateur n'envoie qu'une intention (`move`,
  `pass`, ...), toutes les regles sont verifiees cote serveur, il n'y a rien a gagner a
  bidouiller la console ;
- **identite sans compte** : un jeton aleatoire est stocke dans le navigateur, il suffit
  a retrouver sa place et sa couleur apres un rechargement ou une coupure ;
- **etat complet a chaque mise a jour** : le serveur renvoie l'instantane entier de la
  partie (moins de 500 octets pour un 19x19), ce qui rend impossible toute desynchro
  entre les deux ecrans ;
- **les parties vivent en memoire** : elles disparaissent au redemarrage du serveur, et
  celles inactives depuis six heures sont nettoyees.

---

## English

A two-player online Go board: one player creates the game, shares a link or a 5-letter
code, the other joins. The server is authoritative on the rules, both screens stay in
sync, and a game survives a page reload or a short network drop.

Options: 9x9 / 13x13 / 19x19, handicap 2-9 stones, free komi, choice of who starts and of
your own colour. Chinese (area) scoring with a dead-stone marking phase both players must
accept, positional superko, pass, resign, a *count the score* button that jumps
straight to scoring from any position (declinable, play resumes untouched), and a
one-click rematch with colours swapped. The UI
is bilingual (`FR / EN` button) and mobile-first: tap an intersection, then confirm.

```bash
npm install && npm run dev                 # http://localhost:5173
npm run build && npm start                 # single process, http://localhost:8787
npm test                                   # rules, scoring, rooms
```

Deployment: single Node service serving both the static client and the websocket on
`PORT`. `render.yaml`, `Dockerfile` and `Procfile` are included; health check on
`/health`.

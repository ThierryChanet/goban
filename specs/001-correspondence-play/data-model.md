# Phase 1 — Modèle de données

Toutes les dates sont des millisecondes epoch (`number`). Les formats exacts des
messages sont dans [contracts/](./contracts/).

## Room (salle / partie)

| Champ | Type | Règles |
| --- | --- | --- |
| `id` | `string` | 5 caractères, alphabet sans ambiguïté (inchangé) |
| `mode` | `'correspondence' \| 'live'` | fixé à la création, défaut `correspondence` (FR-001, FR-002) |
| `createdAt` | `number` | date de création |
| `lastActivityAt` | `number` | dernière **action de jeu** acceptée (pas une simple connexion) — base de l'expiration |
| `lastMoveAt` | `number \| null` | dernier coup ou passe (FR-007) |
| `finishedAt` | `number \| null` | renseigné quand `game.phase` devient `finished` |
| `slots` | `Record<Color, Seat>` | voir ci-dessous |
| `game` | `GoGame` | état de jeu (sérialisé en `GameRecord`) |

**Expiration** (correspondance) : la salle est supprimée quand `finishedAt` date de plus de 30 jours, ou, si la partie n'est pas terminée, quand `lastActivityAt` date de plus de 30 jours.
En mode `live`, la règle actuelle s'applique : 6 h sans connexion, sans persistance.

**Revanche** : la même `Room` (même `id`, même `mode`) repart avec un nouveau `GoGame` et
des couleurs échangées. Les `tokens` et `push` suivent le joueur. Après la revanche, `finishedAt` repasse à `null` et `lastMoveAt` à `null`.

## Seat (place de joueur)

| Champ | Type | Règles |
| --- | --- | --- |
| `tokens` | `string[]` | jetons d'appareil autorisés sur cette place (≥ 1 une fois la place prise, au plus 8, les plus anciens évincés) |
| `name` | `string` | ≤ 24 caractères, nettoyé (inchangé) |
| `rematch` | `boolean` | inchangé |
| `push` | `PushTarget[]` | abonnements aux notifications pour cette place (≤ 5, dédupliqués par `endpoint`) |
| `connections` | `Set<Connection>` | **mémoire seulement**, jamais persisté |

Pour la compatibilité, le champ actuel `token: string | null` devient `tokens: string[]`.
`seatOf(token)` cherche alors dans `tokens`. Une place est « libre » quand `tokens` est vide.

## PushTarget (abonnement aux notifications)

| Champ | Type | Règles |
| --- | --- | --- |
| `endpoint` | `string` | URL https du service de push ; clé de dédoublonnage |
| `keys` | `{ p256dh: string; auth: string }` | fournies par le navigateur |
| `lang` | `'fr' \| 'en'` | langue de la notification |
| `createdAt` | `number` | |

Un abonnement est supprimé quand le service de push répond 404 ou 410, ou quand le joueur désactive les alertes.

## GameRecord (sérialisation exacte de `GoGame`)

```text
{
  version: 1,
  config: GameConfig,
  board: string,              // encodage existant (encodeBoard)
  toMove: Color,
  captures: { black, white },
  lastMove: number | null,
  moveNumber: number,
  passes: number,
  phase: 'playing' | 'marking' | 'finished',
  history: MoveRecord[],      // complet (l'instantané, lui, reste tronqué à 200)
  handicapStones: number[],
  deadStones: number[],
  confirmed: { black, white },
  result: string | null,
  undoStack: UndoEntry[]      // { board, toMove, captures, lastMove, passes, addedPosition }
}
```

**Restauration** :

- `positions` = position initiale (plateau vide + handicap) ∪ chaque `undoStack[i].addedPosition` non nul ;
- `score` = `computeAreaScore(board, deadStones, komi)` si `phase === 'finished'` et que `result` ne finit pas par `+R`, sinon `null`.

**Invariant testé** : pour toute suite d'actions, `GoGame.fromRecord(g.toRecord())`
produit le même `snapshot()` que `g`, et se comporte de façon identique pour toute suite
d'actions ultérieure (coups, ko, annulation, passes, comptage).

## RoomRecord (document stocké)

```text
{
  version: 1,
  id, mode, createdAt, lastActivityAt, lastMoveAt, finishedAt,
  slots: { black: SeatRecord, white: SeatRecord },   // Seat sans `connections`
  game: GameRecord
}
```

Seules les salles `mode === 'correspondence'` sont stockées.

## GameSummary (ligne de « Mes parties »)

| Champ | Type |
| --- | --- |
| `roomId` | `string` |
| `seat` | `Color` |
| `opponentName` | `string` (vide si la place adverse est encore libre) |
| `opponentJoined` | `boolean` |
| `size` | `9 \| 13 \| 19` |
| `phase` | `Phase` |
| `yourTurn` | `boolean` : vrai si c'est son trait en phase `playing`, ou s'il doit encore valider en phase `marking` |
| `moveNumber` | `number` |
| `lastMoveAt` | `number \| null` |
| `result` | `string \| null` |

Tri : `yourTurn` d'abord, puis `lastMoveAt` (ou `createdAt`) du plus récent au plus ancien.

## État côté appareil (localStorage)

| Clé | Contenu |
| --- | --- |
| `go:token` | jeton d'appareil (existant) |
| `go:games` | `string[]`, codes des parties où l'appareil a pris place (≤ 50, les plus récents) |
| `go:mode` | dernier mode choisi à la création |
| `go:push` | `'on' \| 'off'`, alertes activées « pour toutes mes parties » sur cet appareil |

## Transitions ajoutées

- **Annulation en correspondance** : elle est autorisée seulement si `phase === 'playing'` et `history.at(-1)?.color === seat`. Sinon, l'erreur est `undo_not_allowed`.
- **Notification** : après chaque action acceptée d'un joueur en correspondance, l'adversaire est notifié si `connections.size === 0` pour sa place et qu'il a au moins un `PushTarget`. Les envois sont regroupés par fenêtre de 30 s.

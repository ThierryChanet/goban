# Contrat — protocole WebSocket (`/ws`)

Ce contrat décrit les modifications à apporter à `src/shared/protocol.ts`. Toutes les
modifications sont **additives** : un client qui n'envoie pas les nouveaux champs obtient
le comportement par défaut, c'est-à-dire le mode correspondance à la création.

## Types partagés

```ts
export type GameMode = 'correspondence' | 'live';

export interface RoomSnapshot {
  roomId: string;
  mode: GameMode;                 // NOUVEAU
  createdAt: number;              // NOUVEAU
  lastMoveAt: number | null;      // NOUVEAU (FR-007)
  game: GameSnapshot;
  players: { black: PlayerInfo; white: PlayerInfo };
  observers: number;
  rematch: { black: boolean; white: boolean };
}

export interface GameSummary {
  roomId: string;
  seat: Color;
  opponentName: string;
  opponentJoined: boolean;
  size: 9 | 13 | 19;
  phase: 'playing' | 'marking' | 'finished';
  yourTurn: boolean;
  moveNumber: number;
  lastMoveAt: number | null;
  result: string | null;
}

export interface PushSubscriptionPayload {
  endpoint: string;               // https uniquement, ≤ 1024 caractères
  keys: { p256dh: string; auth: string };
}
```

## Client → serveur

| Message | Changement | Règles |
| --- | --- | --- |
| `{ type: 'create', …, mode?: GameMode }` | champ `mode` ajouté | absent ou invalide → `'correspondence'` |
| `{ type: 'join', token, name?, roomId, seatKey?: string }` | champ `seatKey` ajouté | si `seatKey` correspond à une place, le jeton est ajouté à cette place (R5) ; une clé invalide est ignorée sans erreur, et le joueur arrive en spectateur ou sur une place libre comme aujourd'hui |
| `{ type: 'undo' }` | règle durcie en correspondance | erreur `undo_not_allowed` si le dernier coup n'est pas le sien |
| `{ type: 'listGames', token: string, roomIds: string[] }` | **nouveau** | au plus 50 codes ; le serveur répond `games` ; ne demande pas d'être dans une salle |
| `{ type: 'pushSubscribe', subscription: PushSubscriptionPayload, lang: 'fr' \| 'en' }` | **nouveau** | demande d'occuper une place dans la salle courante, sinon `not_seated` ; refusé en mode `live` (`wrong_mode`) ; idempotent par `endpoint` |
| `{ type: 'pushUnsubscribe', endpoint: string }` | **nouveau** | retire cet abonnement de la place ; idempotent |

## Serveur → client

| Message | Changement |
| --- | --- |
| `{ type: 'joined', roomId, seat, snapshot, seatKey?: string }` | `seatKey` n'est présent que pour un joueur assis, et seulement dans ce message adressé à la connexion concernée (jamais dans `state` ni à un tiers) |
| `{ type: 'state', seat, snapshot }` | inchangé (l'instantané gagne `mode`, `createdAt`, `lastMoveAt`) |
| `{ type: 'games', games: GameSummary[], missing: string[] }` | **nouveau** : `missing` liste les codes inconnus, expirés, ou où ce jeton n'a pas de place ; le client les retire de `go:games` |
| `{ type: 'error', code }` | nouveaux codes : `undo_not_allowed`, `wrong_mode`, `push_unavailable` |

## Comportements à couvrir par les tests

1. `create` sans `mode` → `snapshot.mode === 'correspondence'`.
2. `join` avec la `seatKey` de Noir depuis un nouveau jeton → `seat === 'black'`, et l'ancien jeton reste aussi valide.
3. La `seatKey` n'apparaît dans aucun message `state`, ni dans aucun message envoyé à l'adversaire ou à un spectateur.
4. Correspondance : Blanc tente d'annuler le coup de Noir → `undo_not_allowed`, état inchangé.
5. Direct : la règle actuelle d'annulation reste inchangée.
6. `listGames` ne renvoie que les parties où le jeton est assis, triées « à vous de jouer » d'abord.

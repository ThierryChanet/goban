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
| `{ type: 'join', token, name?, roomId }` | inchangé | un appareil inconnu arrive sur une place libre, ou en spectateur, comme aujourd'hui |
| `{ type: 'claimSeat', color: Color }` | **nouveau** | correspondance seulement (sinon `wrong_mode`) ; demande d'être dans la salle ; ajoute le jeton de la connexion à la place `color` et y déplace la connexion (R5) ; si le jeton occupait l'autre place, il en est retiré ; idempotent |
| `{ type: 'undo' }` | règle durcie en correspondance | erreur `undo_not_allowed` si le dernier coup n'est pas le sien |
| `{ type: 'peekGame', token: string, roomId: string }` | **nouveau** | le serveur répond `peek` ; ne demande pas d'être dans une salle ; ne crée aucune connexion à la salle |
| `{ type: 'pushSubscribe', subscription: PushSubscriptionPayload, lang: 'fr' \| 'en' }` | **nouveau** | demande d'occuper une place dans la salle courante, sinon `not_seated` ; refusé en mode `live` (`wrong_mode`) ; idempotent par `endpoint` |
| `{ type: 'pushUnsubscribe', endpoint: string }` | **nouveau** | retire cet abonnement de la place ; idempotent |

## Serveur → client

| Message | Changement |
| --- | --- |
| `{ type: 'joined', roomId, seat, snapshot }` | inchangé |
| `{ type: 'state', seat, snapshot }` | inchangé (l'instantané gagne `mode`, `createdAt`, `lastMoveAt`) |
| `{ type: 'peek', roomId: string, summary: GameSummary \| null }` | **nouveau** : `null` si la partie est inconnue, expirée, terminée, ou si ce jeton n'y a pas de place ; le client efface alors `go:current` |
| `{ type: 'error', code }` | nouveaux codes : `undo_not_allowed`, `wrong_mode`, `push_unavailable` |

## Comportements à couvrir par les tests

1. `create` sans `mode` → `snapshot.mode === 'correspondence'`.
2. Correspondance, deux places prises : un nouveau jeton arrive en spectateur, puis `claimSeat black` → `seat === 'black'`, et l'ancien jeton de Noir reste aussi valide.
3. Direct : `claimSeat` → `wrong_mode`.
4. Correspondance : Blanc tente d'annuler le coup de Noir → `undo_not_allowed`, état inchangé.
5. Direct : la règle actuelle d'annulation reste inchangée.
6. `peekGame` renvoie un résumé seulement si le jeton est assis et la partie non terminée ; `null` sinon.

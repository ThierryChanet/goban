---

description: "Tâches d'implémentation : partie par correspondance"
---

# Tasks: Partie par correspondance

**Input**: Design documents from `/specs/001-correspondence-play/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: le plan et le quickstart demandent des suites de tests (persistance, salles,
push), et le projet a déjà une suite Vitest complète. Des tâches de test sont donc
incluses, et elles sont écrites **avant** l'implémentation de chaque story.

**Organization**: les tâches sont regroupées par user story. Chaque story peut ainsi
être implémentée, testée et livrée séparément.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : la tâche peut tourner en parallèle (fichiers différents, aucune dépendance en cours)
- **[Story]** : US1, US2, US3 ou US4 (voir spec.md)
- Chemins relatifs à la racine du dépôt : `src/shared`, `src/server`, `src/client`, `tests/`

---

## Phase 1: Setup (infrastructure partagée)

**Purpose**: dépendances, configuration de build et de déploiement

- [ ] T001 Ajouter les dépendances `web-push` et `pg`, et en dev `@types/web-push` et `@types/pg`, dans package.json (puis `npm install`, qui met à jour package-lock.json)
- [ ] T002 [P] Ajouter `data/` à .gitignore
- [ ] T003 [P] Dans vite.config.ts, passer `publicDir: false` à `publicDir: 'public'` (résolu depuis `root: 'src/client'`, donc `src/client/public/`) et ajouter `/api` au `proxy` de dev, vers `http://localhost:8787`
- [ ] T004 [P] Déclarer `VOLUME /app/data` dans Dockerfile, et ajouter dans render.yaml une variable `DATABASE_URL` avec `sync: false`, commentée « URL Postgres Neon (gratuit) »

---

## Phase 2: Foundational (prérequis bloquants)

**Purpose**: sérialisation exacte du moteur, stockage, types du protocole. Toutes les stories en dépendent.

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase.

### Tests de fondation (à écrire d'abord, ils doivent échouer)

- [ ] T005 [P] Écrire tests/persistence.test.ts, partie `GoGame`. Pour plusieurs parties scriptées, `GoGame.fromRecord(JSON.parse(JSON.stringify(g.toRecord())))` doit donner un `snapshot()` strictement égal à celui de `g`, puis les deux parties doivent se comporter de façon identique sous la même suite d'actions. Parties scriptées : 9x9 avec captures ; ko simple (la reprise immédiate est refusée après restauration) ; handicap 4 ; annulation après restauration ; passe → `requestCount` → `resumePlay` → passe (le comptage ne doit **pas** s'ouvrir) ; partie en phase `marking`, avec pierres mortes et une confirmation ; partie terminée au comptage (même score) ; partie abandonnée (`result` `B+R`, `score` null)
- [ ] T006 [P] Écrire tests/persistence.test.ts, partie stockage. `FileRoomRepository`, dans un dossier temporaire (`fs.mkdtemp`) : `save` puis `loadAll` rend le même document ; `delete` supprime ; deux `save` successifs rapides gardent le dernier ; aucun fichier `.tmp` ne reste ; `getSetting`/`setSetting` persistent. Faire tourner les mêmes cas sur `InMemoryRoomRepository`

### Implémentation de la fondation

- [ ] T007 Dans src/shared/game.ts, ajouter `export interface GameRecord` (version 1, champs exacts de data-model.md § GameRecord, dont `history` complet et `undoStack`). Ajouter `toRecord(): GameRecord` et `static fromRecord(record: GameRecord): GoGame`. La restauration reconstruit `positions` = position initiale (plateau vide + pierres de handicap) ∪ chaque `undoStack[i].addedPosition` non nul. Elle recalcule `score` avec `computeAreaScore(board, deadStones, komi)` si `phase === 'finished'` et que `result` ne finit pas par `+R`, sinon `null`. Rendre `UndoEntry` exportable et rendre `positions`/`undoStack` accessibles aux deux méthodes, sans les exposer dans `snapshot()`
- [ ] T008 [P] Dans src/shared/protocol.ts, ajouter `export type GameMode = 'correspondence' | 'live'` et `GameSummary` (champs de contracts/websocket-protocol.md). Ajouter à `RoomSnapshot` : `mode: GameMode`, `createdAt: number`, `lastMoveAt: number | null`. Ajouter à `ClientMessage` : `mode?: GameMode` sur `create`, puis `{ type: 'claimSeat'; color: Color }`, `{ type: 'peekGame'; token: string; roomId: string }`, `{ type: 'pushSubscribe'; subscription: PushSubscriptionPayload; lang: 'fr' | 'en' }`, `{ type: 'pushUnsubscribe'; endpoint: string }`. Ajouter à `ServerMessage` : `{ type: 'peek'; roomId: string; summary: GameSummary | null }`. Ajouter à `ServerErrorCode` : `'undo_not_allowed' | 'wrong_mode' | 'push_unavailable'`
- [ ] T009 [P] Créer src/server/storage/repository.ts : interface `RoomRepository { loadAll(): Promise<RoomRecord[]>; save(record: RoomRecord): Promise<void>; delete(id: string): Promise<void>; getSetting(key: string): Promise<string | null>; setSetting(key: string, value: string): Promise<void>; readonly kind: 'file' | 'postgres' | 'memory' }` et type `RoomRecord` (data-model.md § RoomRecord : `version: 1, id, mode, createdAt, lastActivityAt, lastMoveAt, finishedAt, slots: { black: SeatRecord, white: SeatRecord }, game: GameRecord`, où `SeatRecord = { tokens: string[]; name: string; rematch: boolean; push: PushTarget[] }`). Ajouter `PushTarget { endpoint; keys: { p256dh; auth }; lang: 'fr' | 'en'; createdAt }` et une fabrique `createRepository(env)` : Postgres si `DATABASE_URL`, sinon fichier dans `DATA_DIR ?? './data'`
- [ ] T010 [P] Créer src/server/storage/memory.ts : `InMemoryRoomRepository` (une `Map` ; renvoie des copies profondes via `structuredClone`)
- [ ] T011 Créer src/server/storage/file.ts : `FileRoomRepository(dir)`. Un fichier `{dir}/rooms/{id}.json` par partie, et un fichier `{dir}/settings.json`. L'écriture est atomique : écrire dans `{id}.json.{random}.tmp`, puis `rename`. Les écritures d'une même salle passent par une file de promesses, pour que la dernière gagne toujours. `loadAll` ignore et journalise un fichier JSON illisible, sans planter. Créer les dossiers au besoin (dépend de T009)
- [ ] T012 Rendre T005 et T006 verts (`npm test`), puis `npm run typecheck`

**Checkpoint**: le moteur se sérialise exactement, et le stockage fichier fonctionne.

---

## Phase 3: User Story 1 - Jouer un coup, partir, revenir plus tard (Priority: P1) 🎯 MVP

**Goal**: une partie en correspondance, mode par défaut, survit aux déconnexions et
aux redémarrages pendant 30 jours. L'annulation est limitée à son propre dernier coup.
L'écran affiche le mode et « Dernier coup il y a … ».

**Independent Test**: quickstart.md §2 et §3. Créer une partie, jouer, fermer,
redémarrer le serveur, rouvrir : l'état est identique. B ne peut pas annuler le coup de A.

### Tests US1 (à écrire d'abord)

- [ ] T013 [P] [US1] Étendre tests/rooms.test.ts. `store.create({ size: 9 })` sans mode → `room.mode === 'correspondence'` et `snapshot().mode === 'correspondence'`. `create(..., 'live')` → `'live'`. `Room.fromRecord(room.toRecord())` restitue les places (tokens, noms), le mode, les dates et l'instantané de jeu. Une salle correspondance dont `lastActivityAt` date de 31 jours est balayée, et `repository.delete` est appelé ; à 29 jours, elle ne l'est pas. Une salle terminée dont `finishedAt` date de 31 jours est balayée. Une salle `live` n'est jamais écrite. Utiliser `vi.useFakeTimers()`/`vi.setSystemTime` et `InMemoryRoomRepository`
- [ ] T014 [P] [US1] Ajouter à tests/rooms.test.ts les cas de l'annulation restreinte. En correspondance, après un coup de Noir, `room.undo('white')` lève `RuleError('undo_not_allowed')` sans changer l'état, et `room.undo('black')` réussit. En `live`, `room.undo('white')` annule le coup de Noir (comportement actuel)

### Implémentation US1

- [ ] T015 [US1] Dans src/server/rooms.ts, ajouter à `Room` les champs `mode: GameMode`, `createdAt`, `lastActivityAt`, `lastMoveAt: number | null`, `finishedAt: number | null`. Remplacer `PlayerSlot.token: string | null` par `tokens: string[]` (au plus 8 ; les plus anciens sont évincés), en adaptant `seatOf`, `attach`, `claimSeat`, `startRematch` et `playerInfo` (`open` = `tokens.length === 0`). `startRematch` remet `finishedAt` et `lastMoveAt` à `null`. Ajouter `toRecord(): RoomRecord` et `static fromRecord(record): Room` (les connexions ne sont jamais sérialisées). `snapshot()` expose `mode`, `createdAt` et `lastMoveAt`
- [ ] T016 [US1] Dans src/server/rooms.ts, ajouter `Room.touch(kind: 'move' | 'other')`. Elle met à jour `lastActivityAt`, et `lastMoveAt` pour un coup ou une passe. Elle renseigne `finishedAt` quand `game.phase` passe à `finished`. Ajouter `Room.undo(seat)` : en correspondance, lever `RuleError('undo_not_allowed')` si `game.history.at(-1)?.color !== seat`, puis appeler `game.undo()`. Ajouter `'undo_not_allowed'` à `RuleErrorCode` dans src/shared/game.ts
- [ ] T017 [US1] Dans src/server/rooms.ts, faire prendre à `RoomStore` un `RoomRepository` dans son constructeur, avec `InMemoryRoomRepository` par défaut, pour garder les tests existants. Ajouter `async loadAll()`, qui charge les salles correspondance non expirées. `create(config, mode = 'correspondence')` reçoit maintenant le mode. Ajouter `persist(room)`, sans effet en `live`, qui appelle `repository.save(room.toRecord())` sans attendre le résultat ; un échec est attrapé et journalisé. `isStale` devient : en `live`, la règle actuelle de 6 h sans connexion ; en correspondance, `finishedAt` ou, à défaut, `lastActivityAt` plus vieux que `CORRESPONDENCE_TTL_MS = 30 * 24 * 3600 * 1000`. `sweep()` appelle `repository.delete` pour les salles correspondance supprimées
- [ ] T018 [US1] Dans src/server/index.ts, créer le repository avec `createRepository(process.env)` et l'attendre avant `httpServer.listen`, via `await store.loadAll()`. Journaliser `stockage: file|postgres, n parties chargées`, et avertir si `RENDER` est défini sans `DATABASE_URL`. Dans `create`, lire `message.mode` : `'live'` ou, sinon, `'correspondence'`. Après chaque action acceptée, et après `create`, `join` (quand une place est prise ou un nom change), `claimSeat` et `rematch`, appeler `room.touch(...)`, `store.persist(room)` puis `broadcast(room)`. `undo` passe par `room.undo(seat)`. Ne plus mettre à jour `lastActivity` sur une simple connexion en correspondance. Ajouter à `/health` les champs `stored` et `storage`
- [ ] T019 [P] [US1] Dans src/client/index.html, ajouter en tête de la carte « Nouvelle partie » un sélecteur segmenté `seg-mode`, avec les boutons `correspondence` (sélectionné) et `live` (`data-i18n="modeCorrespondence"` / `"modeLive"`), et un `<small class="hint" id="mode-hint">`. Dans le panneau de partie, ajouter `<p id="mode-badge" class="hint">` et `<p id="last-move-age" class="hint">`
- [ ] T020 [P] [US1] Dans src/client/i18n.ts, ajouter en FR et EN : `modeCorrespondence` (« Correspondance » / « Correspondence »), `modeLive` (« Direct » / « Live »), `modeHintCorrespondence` (« Jouez à votre rythme : la partie reste ouverte 30 jours après le dernier coup. » / « Play at your own pace: the game stays open for 30 days after the last move. »), `modeHintLive` (« Les deux joueurs sont présents en même temps. » / « Both players are online at the same time. »), `lastMoveAgo` (« Dernier coup il y a {t} » / « Last move {t} ago »), les unités relatives (minutes, heures, jours), `undoNotAllowed` (« Vous ne pouvez annuler que votre propre dernier coup. » / « You can only take back your own last move. ») et `roomExpired` (« Partie introuvable ou expirée. » / « Game not found or expired. »)
- [ ] T021 [US1] Dans src/client/main.ts, câbler `seg-mode` avec `wireSegmented`. La valeur initiale vient de `localStorage['go:mode']`, sinon `'correspondence'`, et chaque choix y est mémorisé. Envoyer le mode dans `createGame` (src/client/net.ts : ajouter le paramètre `mode` et l'inclure dans le message `create`). Dans `render()`, afficher le badge de mode et « Dernier coup il y a … », calculé depuis `snapshot.lastMoveAt` et rafraîchi toutes les 60 s. Dans `renderActions()`, désactiver « Annuler » en correspondance quand `game.history.at(-1)?.color !== myColor()`. Traduire les erreurs `undo_not_allowed` et `room_not_found` (message `roomExpired` + retour à l'accueil, FR-015)
- [ ] T022 [US1] Rendre T013 et T014 verts, garder toute la suite existante verte (`npm test`, `npm run typecheck`), puis dérouler à la main quickstart.md §2, §3 et §7 (non-régression du mode Direct)

**Checkpoint**: MVP livrable. Les parties en correspondance survivent aux redémarrages.
En production, cela demande la Phase 7 (Postgres).

---

## Phase 4: User Story 1 (complément) - Nouvel appareil : « Qui êtes-vous ? » (FR-010)

**Goal**: un appareil inconnu peut reprendre la place Noir ou Blanc d'une partie en correspondance, sans retirer la place aux autres appareils.

**Independent Test**: quickstart.md §5.

- [ ] T023 [P] [US1] Ajouter à tests/rooms.test.ts les cas suivants. En correspondance, avec les deux places prises, un 3e jeton arrive en `observer`. `room.claimSeatFor(conn, token, 'black')` renvoie `'black'`, le jeton est ajouté à `slots.black.tokens`, et l'ancien jeton de Noir reste valide. Si ce jeton était dans `slots.white.tokens`, il en est retiré. L'opération est idempotente. En `live`, l'appel lève `RuleError('wrong_mode')`. Ajouter `'wrong_mode'` à `RuleErrorCode`
- [ ] T024 [US1] Dans src/server/rooms.ts, implémenter `Room.claimSeatFor(connection, token, color)` : correspondance seulement, ajoute le jeton (≤ 8), déplace la connexion de `observers` ou de l'autre place vers `color`, et met `slots[color].name` à jour si le nom est fourni. Dans src/server/index.ts, gérer le message `claimSeat` : il faut être dans une salle, sinon `not_in_room` ; on appelle `claimSeatFor`, on persiste, puis on envoie `joined` (nouvelle place) à cette connexion et on diffuse
- [ ] T025 [P] [US1] Dans src/client/index.html, ajouter une boîte `who-box` (masquée par défaut) avec le titre `whoAreYou`, deux boutons `btn-claim-black` et `btn-claim-white`, et un bouton `btn-just-watch`. Ajouter un bouton `btn-i-am-player` dans le panneau, visible seulement pour un spectateur en correspondance. Dans src/client/i18n.ts, ajouter en FR et EN : `whoAreYou` (« Qui êtes-vous ? » / « Who are you? »), `iAmColor` (« Je suis {couleur} ({nom}) » / « I am {colour} ({name}) »), `justWatch` (« Juste regarder » / « Just watch »), `iAmPlayer` (« Je suis un joueur » / « I'm a player »)
- [ ] T026 [US1] Dans src/client/main.ts et src/client/net.ts, ajouter `GoClient.claimSeat(color)`. Après `joined` avec `seat === 'observer'`, en correspondance, quand les deux places sont prises (`!players.black.open && !players.white.open`), afficher `who-box` avec les noms des joueurs. « Juste regarder » masque la boîte et affiche `btn-i-am-player`, qui la rouvre

---

## Phase 5: User Story 2 - Reprendre la partie en cours (Priority: P2)

**Goal**: une carte d'accueil ouvre en un geste la dernière partie non terminée de l'appareil (FR-009, SC-003).

**Independent Test**: quickstart.md §4.

- [ ] T027 [P] [US2] Ajouter à tests/rooms.test.ts les cas de `Room.summaryFor(token)`. Elle renvoie `null` si le jeton n'est pas assis ou si `phase === 'finished'`. Sinon elle renvoie un `GameSummary` avec `yourTurn` vrai si c'est le trait de sa couleur en `playing`, ou s'il n'a pas encore confirmé en `marking`. `opponentName` est vide et `opponentJoined` est faux tant que la place adverse est libre
- [ ] T028 [US2] Dans src/server/rooms.ts, implémenter `Room.summaryFor(token): GameSummary | null`. Dans src/server/index.ts, gérer `peekGame` : il ne demande pas d'être dans une salle et n'attache aucune connexion. On cherche avec `store.get(roomId)`, puis on répond `{ type: 'peek', roomId, summary }`, avec `summary: null` si la salle est absente
- [ ] T029 [P] [US2] Dans src/client/index.html, ajouter en haut de l'accueil une carte masquée `resume-card` : titre `resumeGame`, ligne `resume-meta` (adversaire, taille) et ligne `resume-turn`, le tout cliquable comme un `<button>`. Dans src/client/i18n.ts, ajouter en FR et EN : `resumeGame` (« Reprendre la partie en cours » / « Resume current game »), `yourTurn` (« À vous de jouer » / « Your move »), `waitingOpponentMove` (« En attente de l'adversaire » / « Waiting for opponent ») et `opponentNotJoined` (« L'adversaire n'a pas encore rejoint » / « Opponent hasn't joined yet »)
- [ ] T030 [US2] Dans src/client/net.ts, ajouter `peekGame(roomId)` et un gestionnaire `onPeek(roomId, summary)`. Dans src/client/main.ts, écrire `localStorage['go:current'] = roomId` à chaque `joined` dont `seat !== 'observer'`. Sur l'accueil, au démarrage et au retour, si `go:current` existe, envoyer `peekGame`. Avec un résumé, afficher `resume-card` (tour, adversaire, taille, « Dernier coup il y a … ») ; un toucher appelle `joinGame`. Avec `null`, effacer `go:current` et masquer la carte

---

## Phase 6: User Story 3 - Être prévenu que c'est à moi de jouer (Priority: P2)

**Goal**: des notifications Web Push préviennent le joueur absent, et un toucher ouvre la partie (FR-011, SC-004).

**Independent Test**: quickstart.md §6.

### Tests US3

- [ ] T031 [P] [US3] Écrire tests/push.test.ts, avec un `sender` simulé injecté dans `PushNotifier`. Une action de Noir notifie les abonnements de Blanc, et seulement si Blanc n'a aucune connexion. Deux actions en moins de 30 s produisent un seul envoi, qui reflète l'événement final (`vi.useFakeTimers`). Une réponse 410 ou 404 retire l'abonnement de la place et déclenche `persist`. Le texte suit `lang` (fr/en). Le mode `live` ne notifie jamais. Au plus 5 abonnements par place, dédupliqués par `endpoint`

### Implémentation US3

- [ ] T032 [P] [US3] Créer src/client/public/manifest.webmanifest (`name: "Go"`, `short_name: "Go"`, `start_url: "/"`, `display: "standalone"`, `background_color` et `theme_color` `#1b1410`, icônes `/icon-192.png` et `/icon-512.png`, `purpose: "any maskable"`) et les deux icônes PNG dans src/client/public/ : goban beige `#dcae6a`, une pierre noire et une pierre blanche, comme le favicon SVG actuel. Dans src/client/index.html, ajouter `<link rel="manifest" href="/manifest.webmanifest">` et `<link rel="apple-touch-icon" href="/icon-192.png">`
- [ ] T033 [P] [US3] Créer src/client/public/sw.js. Sur `push`, lire le JSON `{ roomId, title, body, url, tag }`. Si une fenêtre cliente visible a déjà `?g={roomId}` dans son URL, ne rien afficher ; sinon `showNotification(title, { body, tag, data: { url }, icon: '/icon-192.png' })`. Sur `notificationclick`, mettre au premier plan une fenêtre existante et la faire naviguer vers `url`, sinon `clients.openWindow(url)`. Ajouter `self.skipWaiting()` et `clients.claim()`
- [ ] T034 [US3] Créer src/server/push.ts avec la classe `PushNotifier`. `init(repository)` lit les clés VAPID dans `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` ; à défaut, il les lit dans `repository.getSetting('vapid')`, et sinon il les génère avec `webpush.generateVAPIDKeys()` puis les enregistre. Le sujet vient de `VAPID_SUBJECT ?? 'mailto:admin@localhost'`. Méthodes : `publicKey`, `subscribe(room, color, sub, lang)` (≤ 5, déduplication par `endpoint`, endpoint https uniquement et ≤ 1024 caractères), `unsubscribe(room, color, endpoint)`, et `notify(room, actor, event)`, qui vise l'adversaire de `actor` s'il a 0 connexion et au moins 1 abonnement. Les envois sont regroupés par place sur une fenêtre de 30 s (le dernier événement gagne) et utilisent `TTL: 7 * 24 * 3600`. En cas de 404 ou 410, `notify` retire l'abonnement et appelle `persist`. Les textes FR et EN suivent contracts/http-and-push.md, avec le nom affiché de l'acteur ou, à défaut, « Noir »/« Blanc » (« Black »/« White »). Le `sender` est injectable pour les tests
- [ ] T035 [US3] Dans src/server/index.ts, instancier `PushNotifier` et appeler `init` après le chargement du stockage. Ajouter `GET /api/push-key` → `200 { key }`, ou `503 { key: null }`. Servir `/sw.js` avec `cache-control: no-cache` et `service-worker-allowed: /`, et `/manifest.webmanifest` avec `no-cache`. Gérer `pushSubscribe` (il faut une place, sinon `not_seated` ; en `live` → `wrong_mode` ; puis persister) et `pushUnsubscribe`. Après chaque action acceptée d'un joueur en correspondance (move, pass, undo, requestCount, resumePlay, confirmScore, resign, rematch, et une première prise de place), appeler `notifier.notify(room, seat, event)`. Ajouter `push: boolean` à `/health`
- [ ] T036 [P] [US3] Créer src/client/push.ts. `isPushSupported()` vérifie `serviceWorker`, `PushManager` et `Notification`. `needsHomeScreen()` détecte un iOS hors mode autonome (`navigator.standalone === false`). `enablePush()` enregistre `/sw.js`, demande l'autorisation **seulement** sur un geste de l'utilisateur, récupère `/api/push-key` puis appelle `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, et renvoie `subscription.toJSON()`. `disablePush()` se désabonne. `currentSubscription()`
- [ ] T037 [US3] Dans src/client/index.html, src/client/i18n.ts et src/client/main.ts, ajouter dans le panneau de partie (correspondance et joueur assis seulement) un bouton à bascule « Me prévenir quand c'est à moi » / « Notify me when it's my turn » (`notifyMe`, `notifyOn`, `notifyOff`, `notifyUnsupported`, `notifyIosHint` : « Sur iPhone : Partager → Sur l'écran d'accueil, puis ouvrez Go depuis l'icône. » / « On iPhone: Share → Add to Home Screen, then open Go from the icon. »). L'activation appelle `enablePush()`, met `localStorage['go:push'] = 'on'` et envoie `pushSubscribe` avec `lang`. À chaque `joined` sur une place en correspondance, si `go:push === 'on'` et qu'un abonnement existe, renvoyer `pushSubscribe`. La désactivation envoie `pushUnsubscribe` et met `go:push = 'off'`. Dans src/client/net.ts, ajouter `pushSubscribe`/`pushUnsubscribe`
- [ ] T038 [US3] Rendre T031 vert, puis dérouler quickstart.md §6 sur Chrome pour ordinateur (`localhost`)

---

## Phase 7: Production — stockage Postgres (prérequis de déploiement de US1)

**Goal**: les parties survivent sur Render gratuit grâce à une base Neon (research.md R1).

- [ ] T039 [P] Créer src/server/storage/postgres.ts : `PostgresRoomRepository(url)`, avec un `pg.Pool` (`max: 3` et `ssl: { rejectUnauthorized: false }` quand l'URL contient `sslmode=require` ou un hôte `neon.tech`). Au démarrage, il exécute `CREATE TABLE IF NOT EXISTS rooms (id text primary key, data jsonb not null, updated_at timestamptz not null default now())` et `CREATE TABLE IF NOT EXISTS settings (key text primary key, value text not null)`. `save` fait un upsert `INSERT … ON CONFLICT (id) DO UPDATE`, avec une file par salle comme le stockage fichier. `loadAll`, `delete`, `getSetting`, `setSetting`. `pg` est importé dynamiquement, seulement si `DATABASE_URL` est défini
- [ ] T040 [P] Écrire tests/postgres.test.ts, sauté automatiquement (`describe.skipIf(!process.env.TEST_DATABASE_URL)`) : il rejoue les cas de T006 sur `PostgresRoomRepository`
- [ ] T041 Dans README.md (sections française et anglaise), documenter les modes Correspondance et Direct, la persistance (`DATA_DIR`, `DATABASE_URL`), la procédure Neon pas à pas (créer le projet, copier l'URL de connexion, la coller dans Render → Environment → `DATABASE_URL`), les notifications (`VAPID_*` facultatives, cas iPhone) et les nouveaux champs de `/health`. Retirer la phrase « les parties vivent en mémoire »

---

## Phase 8: User Story 4 & finitions transverses

**Purpose**: mode Direct garanti intact (US4), cohérence et vérifications finales.

- [ ] T042 [US4] Ajouter à tests/rooms.test.ts un test qui joue une partie complète en `live` (création, arrivée de l'adversaire, coups, annulation par l'adversaire, deux passes, comptage, revanche avec échange des couleurs) et vérifie qu'aucun appel `repository.save` n'a lieu
- [ ] T043 [US4] Dans src/client/main.ts, vérifier que le badge de mode est affiché pour les joueurs **et** les spectateurs (FR-002), et que la revanche garde le mode (FR-014 : même `Room`, donc même `mode`)
- [ ] T044 [P] Relire src/client/styles.css. Styler `seg-mode`, `resume-card`, `who-box`, le badge de mode et le bouton de notifications : cibles tactiles d'au moins 44 px, sans survol, et vérification à 360 px de large
- [ ] T045 Exécuter `npm test`, `npm run typecheck` et `npm run build`, puis dérouler quickstart.md de §2 à §7 en entier

---

## Dependencies & Execution Order

### Dépendances de phases

- **Setup (Phase 1)** : aucune dépendance.
- **Foundational (Phase 2)** : après la Phase 1. Elle **bloque** toutes les stories.
- **US1 (Phase 3)** : après la Phase 2. C'est le MVP.
- **US1, complément (Phase 4)** : après la Phase 3, à cause de `tokens[]` et de la persistance.
- **US2 (Phase 5)** : après la Phase 3. Elle est indépendante des Phases 4 et 6.
- **US3 (Phase 6)** : après la Phase 3, à cause de la persistance des abonnements. Elle est indépendante des Phases 4 et 5.
- **Postgres (Phase 7)** : après la Phase 2. Elle est **requise avant la mise en production** de toute story.
- **Phase 8** : après les stories que l'on veut livrer.

### Dépendances internes notables

- T007 → T015 (Room.toRecord utilise GameRecord)
- T009 → T010, T011, T017, T039
- T015 → T016 → T017 → T018
- T008 → T018, T021, T024, T028, T035
- T034 → T035 ; T036 → T037

### Opportunités de parallélisme

- Phase 1 : T002, T003 et T004 en parallèle.
- Phase 2 : T005, T006, T008, T009 et T010 en parallèle ; T011 après T009.
- Phase 3 : T013, T014, T019 et T020 en parallèle avec le travail serveur T015 à T018.
- Après la Phase 3, les Phases 4, 5, 6 et 7 peuvent avancer en parallèle (fichiers serveur partagés : coordonner les modifications de src/server/index.ts).
- Phase 6 : T032, T033 et T036 (client) en parallèle avec T034 (serveur).

## Parallel Example: User Story 1

```text
# Tests et UI en parallèle du serveur :
T013 tests/rooms.test.ts (mode, persistance, expiration)
T014 tests/rooms.test.ts (annulation restreinte)   # même fichier que T013 : à enchaîner, ou à placer dans un describe séparé
T019 src/client/index.html (sélecteur de mode)
T020 src/client/i18n.ts (textes)
# Puis, en séquence : T015 → T016 → T017 → T018 → T021 → T022
```

## Parallel Example: User Story 3

```text
T032 src/client/public/manifest.webmanifest + icônes
T033 src/client/public/sw.js
T036 src/client/push.ts
T034 src/server/push.ts           # en parallèle du client
# Puis : T035 (serveur) → T037 (UI) → T038
```

## Implementation Strategy

### MVP d'abord

1. Phases 1 et 2 (fondations).
2. Phase 3 (US1) : on peut jouer en différé, et les parties survivent aux redémarrages.
3. Phase 7 (Postgres) : nécessaire pour que le MVP tienne sur Render gratuit.
4. **STOP et validation** : quickstart.md §2, §3 et §7, en local puis sur Render avec Neon.

### Livraison incrémentale

1. MVP (US1 + Postgres), déployable.
2. Phase 4 : changement d'appareil.
3. Phase 5 : carte « Reprendre la partie en cours ».
4. Phase 6 : notifications.
5. Phase 8 : non-régression et finitions.

Chaque incrément peut être poussé et déployé séparément, sans casser le précédent.

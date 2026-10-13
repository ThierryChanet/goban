# Implementation Plan: Partie par correspondance

**Branch**: `claude/hopeful-bell-cbqv1f` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-correspondence-play/spec.md`

## Summary

On ajoute un mode **Correspondance**, sélectionné par défaut, à côté du mode actuel,
renommé **Direct**. Une partie en correspondance est conservée dans un stockage durable
pendant 30 jours sans activité. Ce stockage est un fichier JSON en local, ou Postgres
en production via `DATABASE_URL`. La partie survit ainsi aux déconnexions, aux mises
en veille et aux redémarrages.

La sauvegarde reproduit **exactement** l'état du moteur (`GoGame.toRecord/fromRecord`),
pile d'annulation et super-ko compris. Sur un nouvel appareil, le joueur
indique simplement s'il est Noir ou Blanc. L'accueil propose « Reprendre la partie en cours ». Des **notifications Web Push**
(VAPID, service worker, manifeste) préviennent le joueur absent quand c'est à lui.

En correspondance, l'annulation est limitée à son propre dernier coup.

## Technical Context

**Language/Version**: TypeScript 5.7, Node ≥ 20 (22 en production), navigateur ES2022

**Primary Dependencies**: existantes : `ws`, Vite, Vitest. Nouvelles : `web-push`, `pg`, `@types/web-push`, `@types/pg`

**Storage**: interface `RoomRepository`, avec deux implémentations :

- `FileRoomRepository` : JSON par partie dans `DATA_DIR` ; c'est le défaut, pour le dev, les tests et Docker ;
- `PostgresRoomRepository` : `DATABASE_URL`, pour la production sur Render gratuit avec Neon. Voir [research.md R1](./research.md).

**Testing**: Vitest (`npm test`), `tsc --noEmit` (`npm run typecheck`)

**Target Platform**: un seul service Node (HTTP + WebSocket sur `PORT`), navigateurs mobiles d'abord (iOS Safari 16.4+ pour le push, une fois l'application ajoutée à l'écran d'accueil ; Chrome et Firefox Android et ordinateur)

**Project Type**: application web, avec client et serveur dans le même dépôt et `src/shared` commun

**Performance Goals**: un coup est diffusé à l'adversaire connecté sans délai perceptible (comme aujourd'hui) ; l'écriture se fait en arrière-plan et ne bloque pas la diffusion ; notification en moins de 5 min (SC-004), en pratique quelques secondes

**Constraints**: pas de compte utilisateur ; plan gratuit Render (disque éphémère, mise en veille après 15 min) ; serveur seul juge des règles ; interface bilingue FR/EN, d'abord pour le téléphone ; aucune régression du mode Direct

**Scale/Scope**: quelques centaines de parties simultanées, jusqu'à environ 110 ko par partie au pire (19x19, 300 coups), un seul processus

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` est encore le **modèle vierge** : aucun principe n'est
ratifié, donc il n'y a aucune porte formelle. On applique à la place les principes de
fait du README, en guise de garde-fous :

| Principe implicite (README) | Respect par ce plan |
| --- | --- |
| Le serveur fait autorité, le client n'envoie que des intentions | ✅ annulation restreinte, choix de place, `peekGame` : tout est vérifié côté serveur |
| Règles partagées mot pour mot entre client et serveur (`src/shared`) | ✅ la sérialisation `GoGame` vit dans `src/shared/game.ts` ; les types du protocole dans `protocol.ts` |
| Identité sans compte (jeton dans le navigateur) | ✅ conservée ; une place accepte plusieurs jetons d'appareil |
| Instantané complet à chaque mise à jour | ✅ inchangé ; l'instantané gagne 3 champs |
| Un seul service, déployable en un clic | ⚠️ une base externe est nécessaire pour la persistance sur Render gratuit (voir Complexity Tracking) ; sans elle, le service démarre quand même |
| Tests de règles complets | ✅ un test d'aller-retour exact de sérialisation et de nouveaux tests de salles |

**Re-check après la Phase 1** : le design ne change rien aux points ci-dessus. Le seul
écart justifié est la dépendance de stockage externe, qui reste optionnelle.

## Project Structure

### Documentation (this feature)

```text
specs/001-correspondence-play/
├── spec.md
├── plan.md              # ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── websocket-protocol.md
│   └── http-and-push.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
  shared/
    game.ts          # + toRecord() / static fromRecord() (GameRecord)
    protocol.ts      # + GameMode, GameSummary, peekGame/peek, push*, claimSeat, nouveaux codes d'erreur
  server/
    rooms.ts         # Room : mode, dates, tokens[], push[] ; toRecord/fromRecord ;
                     #   undo restreint ; résumés ; expiration 30 j ; RoomStore branché sur le repository
    storage/
      repository.ts  # interface RoomRepository (+ settings clé/valeur) et fabrique selon l'environnement
      file.ts        # FileRoomRepository (écriture atomique, file d'attente par salle)
      postgres.ts    # PostgresRoomRepository (création des tables au démarrage)
      memory.ts      # InMemoryRoomRepository (tests)
    push.ts          # clés VAPID, envoi web-push, regroupement 30 s, purge 404/410, textes FR/EN
    index.ts         # chargement initial, nouveaux messages, /api/push-key, /sw.js, /manifest.webmanifest
  client/
    public/
      sw.js                  # service worker (push, notificationclick)
      manifest.webmanifest
      icon-192.png, icon-512.png
    main.ts          # sélecteur de mode, carte « Reprendre », « Qui êtes-vous ? », activation des alertes, « il y a … »
    net.ts           # claimSeat, peekGame, push(un)subscribe, gestion de `peek`
    push.ts          # enregistrement du service worker, abonnement, détection iOS
    i18n.ts          # nouveaux textes FR / EN
    index.html       # carte « Reprendre la partie en cours », sélecteur de mode, lien du manifeste
    styles.css
tests/
  persistence.test.ts   # GoGame.toRecord/fromRecord, FileRoomRepository
  rooms.test.ts         # + mode par défaut, claimSeat, undo restreint, peekGame, expiration
  push.test.ts          # regroupement, destinataire, purge (web-push simulé)
```

**Structure Decision** : on garde la structure existante à trois dossiers (`shared`,
`server`, `client`). Le stockage est isolé dans `src/server/storage/` derrière une
interface, et le push dans `src/server/push.ts` et `src/client/push.ts`. Vite gagne
`publicDir: 'public'`, ce qui sert `sw.js` et le manifeste à la racine.

## Découpage proposé (pour /speckit-tasks)

1. **Fondations (US1)** : sérialisation `GoGame` et ses tests, `RoomRepository` (mémoire et fichier), `Room` avec mode, dates et `tokens[]`, chargement et écriture, expiration 30 j, `mode` dans `create`, sélecteur de mode côté client, affichage du mode et de « Dernier coup il y a … ». **C'est le MVP livrable seul.**
2. **Annulation restreinte (US1)** : règle de salle, erreur et bouton désactivé.
3. **Nouvel appareil (FR-010)** : `claimSeat`, écran « Qui êtes-vous ? », bouton « Je suis un joueur ».
4. **Reprendre la partie (US2)** : `go:current`, `peekGame` / `peek`, carte d'accueil.
5. **Postgres (prod)** : `PostgresRoomRepository`, `render.yaml`, README.
6. **Notifications (US3)** : manifeste et icônes, service worker, `/api/push-key`, `push.ts` serveur et client, écran d'activation et cas iOS.
7. **Finitions** : textes FR/EN, message « partie introuvable ou expirée », `/health`, README, non-régression du mode Direct.

## Complexity Tracking

| Écart | Pourquoi c'est nécessaire | Alternative plus simple écartée parce que |
| --- | --- | --- |
| Base Postgres externe (optionnelle) | le disque du plan gratuit Render est éphémère et la mémoire est vidée à la mise en veille ; sans stockage externe, aucune partie ne survit plus de 15 min sans visite | le stockage fichier seul ne marche qu'avec un disque persistant (plan payant) ; garder les parties en mémoire contredit l'US1 |
| Deux dépendances (`web-push`, `pg`) | chiffrement et signature VAPID du push ; client Postgres | réimplémenter RFC 8291/8292 est risqué ; `pg` est le client de référence, chargé seulement si `DATABASE_URL` est défini |

# Feature Specification: Partie par correspondance (un coup à la fois, en différé)

**Feature Branch**: `claude/hopeful-bell-cbqv1f`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Sur le Goban, ajouter un mode de jeu (activé par défaut) où l'on joue un coup à la fois, potentiellement en long différé (correspondance / asynchrone) avec un autre joueur : chaque joueur peut jouer son coup puis quitter, et l'adversaire joue le sien plus tard (heures ou jours après)."

## Contexte

Aujourd'hui, une partie suppose que les deux joueurs soient présents en même temps : elle
vit en mémoire, disparaît au redémarrage du service et est supprimée après six heures sans
activité. Rien n'indique à un joueur absent que c'est à lui de jouer, et rien ne lui
permet de retrouver ses parties en cours, sauf s'il a gardé le lien.

Le mode **correspondance** permet de jouer une partie étalée sur des jours ou des semaines :
je joue mon coup, je ferme l'application, mon adversaire joue le sien quand il le veut, et
je reviens plus tard. Ce mode devient le **mode par défaut** à la création d'une partie.
Le mode actuel reste disponible sous le nom **direct** (les deux joueurs sont présents).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jouer un coup, partir, revenir plus tard (Priority: P1)

Alice crée une partie, sans changer le mode, qui est en correspondance par défaut. Elle
envoie le lien à Bruno et joue son premier coup. Elle ferme son navigateur. Le
lendemain, Bruno ouvre le lien, voit le goban avec le coup d'Alice, joue le sien et ferme
à son tour. Deux jours plus tard, Alice rouvre le lien : la partie est intacte, le coup de
Bruno est affiché et c'est à elle de jouer.

**Why this priority**: c'est le cœur de la demande. Sans conservation de la partie sur
plusieurs jours, et malgré les redémarrages du service, aucun autre élément de la
fonctionnalité n'a de sens.

**Independent Test**: créer une partie, jouer un coup, fermer tous les onglets, simuler
plusieurs jours sans activité et un redémarrage du service, puis rouvrir le lien avec
chacun des deux joueurs et poursuivre la partie.

**Acceptance Scenarios**:

1. **Given** l'écran de création d'une partie, **When** le joueur crée la partie sans toucher au mode, **Then** la partie est en mode correspondance.
2. **Given** une partie en correspondance où Alice vient de jouer, **When** Alice ferme l'application, **Then** la partie reste disponible et Bruno peut jouer son coup plus tard, sans qu'Alice soit connectée.
3. **Given** une partie en correspondance inactive depuis 7 jours, **When** l'un des joueurs rouvre son lien, **Then** il retrouve exactement le même état : plateau, prisonniers, tour de jeu, historique de ko et réglages.
4. **Given** une partie en correspondance en cours, **When** le service redémarre, **Then** la partie n'est pas perdue.
5. **Given** les deux joueurs connectés en même temps à une partie en correspondance, **When** l'un joue, **Then** l'autre voit le coup aussi vite qu'en mode direct.

---

### User Story 2 - Savoir où en sont mes parties (Priority: P2)

Alice a trois parties en correspondance avec trois personnes. En ouvrant l'application,
elle voit la liste de ses parties en cours. Pour chacune, elle voit l'adversaire, la
taille du goban, si c'est à elle de jouer et depuis quand le dernier coup a été joué.
Les parties où c'est à elle de jouer apparaissent en premier. Elle touche une partie pour
l'ouvrir.

**Why this priority**: dès qu'on joue en différé, il faut pouvoir retrouver ses parties
sans avoir gardé chaque lien, et voir d'un coup d'œil celles qui attendent un coup.

**Independent Test**: depuis un même appareil, créer ou rejoindre plusieurs parties,
jouer dans certaines, revenir sur l'accueil et vérifier la liste, l'ordre et l'indication
« à vous de jouer ».

**Acceptance Scenarios**:

1. **Given** un joueur qui participe à plusieurs parties en correspondance depuis cet appareil, **When** il ouvre l'accueil, **Then** il voit la liste de ses parties non terminées, celles où c'est à lui de jouer en premier.
2. **Given** la liste des parties, **When** le joueur touche une partie, **Then** elle s'ouvre directement à sa place et dans sa couleur.
3. **Given** une partie terminée, **When** le joueur ouvre l'accueil, **Then** elle n'apparaît plus parmi les parties en cours, et son résultat reste consultable pendant la durée de conservation.

---

### User Story 3 - Être prévenu que c'est à moi de jouer (Priority: P2)

Quand l'adversaire a joué, le joueur absent apprend qu'il est attendu, sans devoir
ouvrir la partie régulièrement pour vérifier.

**Why this priority**: sans signal, une partie par correspondance s'enlise. Cette story
reste toutefois séparable, car la liste de l'US2 suffit déjà à jouer.

**Independent Test**: un joueur active les alertes. Son adversaire joue pendant qu'il
n'a pas la partie ouverte. Vérifier qu'il reçoit l'alerte et qu'elle ouvre la bonne
partie.

**Acceptance Scenarios**:

1. **Given** un joueur qui a accepté d'être prévenu et qui n'a pas la partie ouverte, **When** l'adversaire joue, passe, propose le comptage ou annule, **Then** le joueur reçoit une alerte [NEEDS CLARIFICATION: par quel canal ? notification du navigateur/téléphone, e-mail, ou aucun canal (la liste de l'US2 suffit) ?].
2. **Given** une alerte reçue, **When** le joueur la touche, **Then** la partie concernée s'ouvre.
3. **Given** un joueur qui n'a pas accepté d'être prévenu, **When** l'adversaire joue, **Then** il ne reçoit rien, et la partie fonctionne normalement.

---

### User Story 4 - Choisir le mode direct (Priority: P3)

Deux joueurs assis côte à côte, ou en appel, préfèrent le fonctionnement actuel. À la
création, ils choisissent **Direct** au lieu de **Correspondance**.

**Why this priority**: ce mode existe déjà. Il suffit de le garder accessible et
clairement nommé.

**Independent Test**: créer une partie en mode direct et vérifier qu'elle se comporte
exactement comme aujourd'hui.

**Acceptance Scenarios**:

1. **Given** l'écran de création, **When** le joueur choisit le mode direct, **Then** la partie se comporte comme aujourd'hui, y compris pour l'annulation.
2. **Given** une partie, quel que soit son mode, **When** un joueur ou un spectateur l'ouvre, **Then** le mode est indiqué à l'écran.

---

### Edge Cases

- **Annulation en différé** : aujourd'hui, l'annulation reprend le dernier coup, quel qu'en soit l'auteur. En correspondance, un joueur pourrait donc effacer le coup que son adversaire a joué pendant son absence. Règle retenue : un joueur ne peut annuler que **son propre** dernier coup, et seulement tant que l'adversaire n'a pas encore joué.
- **Coup posé mais non confirmé** : si le joueur quitte l'application entre « viser » et « confirmer », rien n'est joué.
- **Deux appareils pour le même joueur** : si le joueur ouvre la partie sur un autre appareil où il n'a jamais joué, il arrive en spectateur. Il doit pouvoir récupérer sa place grâce à un lien personnel, distinct du lien d'invitation (voir FR-010).
- **Adversaire qui ne rejoint jamais** : la partie reste ouverte, en attente d'un second joueur, jusqu'au délai d'expiration.
- **Adversaire qui ne joue plus** : aucune perte au temps n'est appliquée (pas de pendule). Le joueur qui attend peut toujours abandonner, ou proposer de compter les points. Une partie sans aucune activité finit par expirer (FR-008).
- **Phase de comptage en différé** : marquer les pierres mortes puis valider peut se faire en plusieurs visites, et chaque joueur voit les marques de l'autre quand il revient.
- **Revanche** : une revanche hérite du mode de la partie d'origine.
- **Partie expirée** : ouvrir le lien d'une partie supprimée affiche un message clair (« partie introuvable ou expirée »), pas un écran vide.
- **Coup joué au même instant que l'annulation ou le comptage de l'adversaire** : le service applique les actions dans l'ordre où il les reçoit. Le joueur dont l'action devient invalide en est informé, et l'état affiché est l'état réel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: À la création d'une partie, le système MUST proposer deux modes, **Correspondance** et **Direct**, avec **Correspondance** sélectionné par défaut.
- **FR-002**: Le mode d'une partie MUST être fixé à sa création et affiché aux joueurs comme aux spectateurs.
- **FR-003**: En correspondance, un joueur MUST pouvoir jouer son coup (ou passer) sans que l'adversaire soit connecté. Le coup est enregistré dès sa confirmation.
- **FR-004**: En correspondance, le système MUST conserver l'état complet de la partie quand les joueurs se déconnectent et quand le service redémarre. L'état complet comprend le plateau, les prisonniers, le tour, l'historique de ko, les réglages, les places, la phase de comptage et le résultat.
- **FR-005**: Quand les deux joueurs sont connectés à une partie en correspondance, le système MUST transmettre chaque coup à l'autre joueur aussi vite qu'en mode direct.
- **FR-006**: En correspondance, un joueur MUST pouvoir annuler uniquement son propre dernier coup ou sa propre dernière passe, et seulement tant que l'adversaire n'a pas joué depuis. Le mode direct conserve la règle actuelle.
- **FR-007**: Le système MUST afficher, dans une partie, à qui est le tour et depuis quand le dernier coup a été joué (par exemple « Dernier coup il y a 2 jours »).
- **FR-008**: Une partie en correspondance MUST être conservée tant qu'elle a eu une activité depuis moins de [NEEDS CLARIFICATION: au bout de combien de temps sans aucune activité une partie en correspondance est-elle supprimée ? 30 jours, 90 jours, jamais ?]. Le mode direct conserve son délai actuel de 6 heures.
- **FR-009**: Le système MUST afficher sur l'accueil la liste des parties non terminées auxquelles le joueur participe depuis cet appareil. Pour chaque partie, la liste indique l'adversaire, la taille du goban, si c'est à lui de jouer et l'ancienneté du dernier coup. Les parties où c'est à lui de jouer apparaissent en premier.
- **FR-010**: Chaque joueur MUST disposer d'un **lien personnel** qui lui rend sa place et sa couleur sur n'importe quel appareil. Ce lien est distinct du lien d'invitation et lui est présenté avec l'avertissement qu'il ne doit pas être partagé.
- **FR-011**: Le système MUST permettre à un joueur d'être prévenu quand c'est à lui de jouer. Le joueur choisit d'activer ou non ces alertes (voir US3 pour le canal). Une alerte MUST mener directement à la partie concernée.
- **FR-012**: Toutes les règles existantes s'appliquent à l'identique en correspondance : captures, suicide interdit, super-ko, passe, comptage chinois, marquage des pierres mortes avec validation des deux joueurs, abandon, comptage demandé, revanche.
- **FR-013**: La phase de comptage MUST pouvoir se dérouler en plusieurs visites : les marques de pierres mortes sont conservées entre les visites et chaque joueur valide quand il le souhaite.
- **FR-014**: Une revanche MUST reprendre le mode de la partie d'origine.
- **FR-015**: L'ouverture d'une partie expirée ou inexistante MUST afficher un message explicite et proposer de revenir à l'accueil.
- **FR-016**: Tous les nouveaux textes MUST exister en français et en anglais, et les nouveaux écrans MUST rester utilisables au téléphone.

### Key Entities

- **Partie** : réglages (taille, handicap, komi, qui commence), mode (correspondance ou direct), état de jeu, historique des coups, date de création, date du dernier coup, date de la dernière activité, résultat éventuel.
- **Place de joueur** : couleur, nom affiché, identité secrète permettant de reprendre la place (base du lien personnel), et préférence d'alerte avec ses coordonnées éventuelles.
- **Liste des parties d'un appareil** : les parties auxquelles cet appareil a participé, avec la couleur occupée dans chacune.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des parties en correspondance encore actives sont retrouvées intactes après un redémarrage du service.
- **SC-002**: Une partie en correspondance laissée sans activité pendant 7 jours reprend exactement là où elle en était, pour les deux joueurs.
- **SC-003**: Depuis l'accueil, un joueur ouvre une partie où c'est à lui de jouer en 2 gestes au plus.
- **SC-004**: Quand le joueur a activé les alertes, il est prévenu en moins de 5 minutes dans 95 % des cas après le coup de son adversaire.
- **SC-005**: Un joueur qui change d'appareil retrouve sa place grâce à son lien personnel en moins de 30 secondes.
- **SC-006**: Aucune régression du mode direct : tous les comportements actuels, dont la reconnexion, la revanche et l'annulation, restent identiques.

## Assumptions

- **Pas de comptes utilisateurs** : l'identité reste un secret stocké sur l'appareil, complété par le lien personnel (FR-010) pour changer d'appareil. Créer des comptes est hors périmètre.
- **Pas de pendule** : il n'y a ni temps par coup ni perte au temps, conformément au périmètre actuel (« pendules » exclues). Un délai par coup pourra faire l'objet d'une fonctionnalité séparée.
- **Annulation** : en correspondance, elle est restreinte à son propre dernier coup tant que l'adversaire n'a pas joué (voir Edge Cases). C'est le choix le plus sûr quand l'autre joueur est absent.
- **Mode par défaut** : le choix de mode est mémorisé sur l'appareil, mais une première visite propose toujours **Correspondance**.
- **Volumétrie** : quelques centaines de parties simultanées au plus. Le service reste un service unique, déployable comme aujourd'hui.
- **Spectateurs** : une troisième personne qui ouvre le lien d'invitation voit la partie sans jouer, comme aujourd'hui.
- **Hors périmètre** : chat, commentaires sur les coups, SGF, classement, matchmaking.

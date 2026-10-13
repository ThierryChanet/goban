# Contrat — HTTP, notifications push et configuration

## Points d'accès HTTP

| Méthode et chemin | Réponse | Changement |
| --- | --- | --- |
| `GET /health` | `{ ok: true, rooms: number, stored: number, storage: 'file' \| 'postgres', push: boolean, uptime: number }` | champs `stored`, `storage`, `push` ajoutés |
| `GET /api/push-key` | `200 { key: string }` (clé publique VAPID, base64url), ou `503 { key: null }` si le push est indisponible | **nouveau** |
| `GET /sw.js` | service worker, `cache-control: no-cache`, `service-worker-allowed: /` | **nouveau** |
| `GET /manifest.webmanifest` | manifeste web (`display: standalone`, `start_url: /`, icônes 192 et 512) | **nouveau** |

## Charge utile d'une notification (serveur → service worker)

Le serveur l'envoie chiffrée via `web-push`, avec un TTL de 7 jours et une urgence `normal`.

```json
{
  "roomId": "K7P2Q",
  "title": "Go — à vous de jouer",
  "body": "Blanc a joué le coup 42 (19x19).",
  "url": "/?g=K7P2Q",
  "tag": "go-K7P2Q"
}
```

Les textes viennent d'un petit dictionnaire serveur, en français et en anglais, choisi
selon le `lang` de l'abonnement. Événements et titres :

| Événement de l'adversaire | Titre (fr) | Titre (en) |
| --- | --- | --- |
| coup | Go — à vous de jouer | Go — your move |
| passe | Go — {nom} a passé | Go — {name} passed |
| annulation | Go — {nom} a repris son coup | Go — {name} took back a move |
| demande de comptage / validation | Go — comptage des points | Go — scoring |
| reprise de la partie | Go — la partie reprend | Go — game resumed |
| abandon / fin de partie | Go — partie terminée | Go — game over |
| arrivée de l'adversaire | Go — {nom} a rejoint la partie | Go — {name} joined |
| proposition de revanche | Go — revanche proposée | Go — rematch offered |

## Service worker (`/sw.js`)

- `push` : il affiche la notification (`tag` = remplacement de l'ancienne). Si une fenêtre de l'application est déjà **visible** sur cette partie, il ne l'affiche pas.
- `notificationclick` : il met au premier plan une fenêtre de l'application déjà ouverte et la fait naviguer vers `url`, sinon il ouvre `url`.
- Aucun cache hors ligne (hors périmètre).

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | absente | si présente, stockage Postgres (R1) ; sinon stockage fichier |
| `DATA_DIR` | `./data` | dossier du stockage fichier |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | absentes | si absentes, elles sont générées une fois et conservées dans le stockage |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | contact exigé par les services de push |

`render.yaml` ajoute `DATABASE_URL` (`sync: false`). Le `Dockerfile` déclare
`VOLUME /app/data`, et `.gitignore` ajoute `data/`.

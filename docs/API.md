# API REST + WebSocket — RobLaude

> Endpoints du backend (Node + Express). Base : `/api`.
> Auth par JWT : header `Authorization: Bearer <token>` requis partout **sauf**
> `/health` et `POST /api/auth/login`. Les routes marquées **(admin)** exigent
> le rôle `ADMIN`. Le contrat MQTT back ↔ robot est dans [mqtt-spec.md](mqtt-spec.md).

## Auth — `/api/auth`

| Méthode | Route | Description |
|---|---|---|
| POST | `/login` | Connexion → `{ token, user }` |
| POST | `/register` | Créer un utilisateur **(admin)** — pas d'inscription publique |
| GET | `/me` | Profil de l'utilisateur connecté |

## Missions — `/api/missions`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste paginée (`?status=&type=&page=&limit=`) |
| GET | `/:id` | Détail d'une mission |
| POST | `/` | Créer une mission (`type`, `fromPointId`, `toPointId`, `robotId?`, `objectId?`). `objectId` obligatoire si `PICK_AND_PLACE` |
| POST | `/:id/cancel` | Annuler (libère le robot) |
| POST | `/:id/resume` | Reprendre une mission en pause |
| POST | `/:id/stop` | Arrêt d'urgence (publie `cmd/emergency-stop`) |
| POST | `/:id/confirm-loading` | Confirmer le chargement (UC-01) |

## Points — `/api/points`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des points nommés |
| GET | `/:id` | Détail (avec objets) |
| POST | `/` | Créer **(admin)** |
| PUT | `/:id` | Modifier **(admin)** |
| DELETE | `/:id` | Supprimer **(admin)** — refusé si lié à des missions |

## Objets — `/api/objects`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des objets saisissables (avec emplacement) |
| GET | `/:id` | Détail |
| POST | `/` | Créer **(admin)** |
| PUT | `/:id` | Modifier **(admin)** |
| DELETE | `/:id` | Supprimer **(admin)** — refusé si lié à des missions |

## Robots — `/api/robots`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Liste des robots |
| GET | `/:id/status` | État (position, batterie, statut) |
| GET | `/:id/map` / `/:id/map.png` | Dernière carte SLAM |
| GET | `/arm/presets` | Poses prédéfinies du bras |
| POST | `/:id/arm` | Commander le bras (6 articulations) |
| POST | `/:id/arm/preset/:preset` | Jouer une pose prédéfinie |

## Mapping — `/api/mapping`

| Méthode | Route | Description |
|---|---|---|
| POST | `/start` | Démarrer une session SLAM |
| POST | `/stop` | Arrêter la session |
| POST | `/save` | Sauvegarder un snapshot de carte |
| GET | `/sessions` / `/sessions/:id` | Sessions de mapping |
| GET | `/snapshots/:id/download.:ext` | Télécharger un snapshot (pgm/yaml/png) |
| POST | `/snapshots/:id/set-current` | Définir la carte courante |

## Annotations — `/api/annotations`

| Méthode | Route | Description |
|---|---|---|
| GET | `/?mapSnapshotId=` | Annotations d'une carte |
| POST | `/` | Créer une annotation |
| PATCH | `/:id` | Modifier |
| DELETE | `/:id` | Supprimer |

## SSH admin — `/api/admin/ssh` (admin)

| Méthode | Route | Description |
|---|---|---|
| GET | `/audit` | Journal d'audit des commandes SSH |
| GET | `/robots/:id/logs` | Logs `journalctl` du robot |
| POST | `/exec` | Exécuter une commande (allowlist) |

## Santé

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` · `/api/health` | Liveness (public) |

## WebSocket

Connexion avec le token en query (`?token=<jwt>`).

| Route | Flux |
|---|---|
| `/ws` | Flux global : position robot, changement de statut, mises à jour de mission |
| `/ws/robots/:id/telemetry` | Carte SLAM, scan LiDAR, plan, frontières, caméra, joint_states |
| `/ws/robots/:id/tf` | Arbre des transformations (TF) |
| `/ws/robots/:id/topics` | Liste des topics ROS actifs |
| `/ws/robots/:id/ssh` | Terminal SSH interactif **(admin)** |

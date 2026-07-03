# RobLaude — Architecture & mémoire projet (SOURCE CANONIQUE)

> **C'est LE document de référence.** Source de vérité unique du projet (matériel, réseau,
> contrôle robot, MQTT, archi web + robot, pièges, causes racines connues).
> Tout le reste (AGENTS.md, CODEX_BRIEFING.md) a été fusionné ici pour ne plus diverger.
>
> Dernière mise à jour : **2026-06-19**. Robot : Yahboom ROSMASTER M3 Pro / Jetson Nano / ROS 2 Humble.
> Projet académique HETIC — 18 semaines (fév → juin 2026). Équipe : **Wissem** (robot réel + web) + **Maxime** (web/simu + CI).
>
> **Convention de fiabilité** (règle absolue) : chaque fait sensible porte une étiquette —
> **[PROUVÉ]** = observé/mesuré directement · **[DÉDUIT]** = inféré d'indices, à confirmer ·
> **[SUPPOSÉ]** = hypothèse non testée. Si pas d'étiquette = fait stable établi.

---

## 0. Index — quoi lire, et le rôle de chaque doc

| Doc | Rôle | Quand le lire |
|-----|------|---------------|
| **`docs/architecture.md`** (ce fichier) | **Source canonique** : tout le contexte stable | **Toujours, en premier** |
| `docs/STATUS.md` | État des sprints, ce qui est en cours | Début de session |
| `docs/DETTE.md` | Dette technique ouverte (actions claires) | Avant de planifier |
| `docs/DIFFICULTES_ROBOT.md` | Récit problème→cause→fix (pour la soutenance) | Prépa soutenance |
| `docs/ROBOT.md` | Faits robot sourcés `fichier:ligne` | Vérifier un détail précis |
| `docs/mqtt-spec.md` | Contrat MQTT détaillé (le vrai schéma des payloads) | Toucher au bridge / backend MQTT |
| `docs/AUTONAV_PROCEDURE.md` | Runbook test autonav Nav2 | Tester la nav sur le robot |
| `docs/UC03_SCAN_FETCH_QR.md` | **Spec** : explore → découvrir QR → fetch sur clic → retour base | Travailler sur le pick&place autonome / QR |
| `docs/CDC_Roblaude_v1.2.md` / `ROADMAP.md` | Cahier des charges + roadmap | Cadrage produit |
| `docs/journal/` | Historique narratif des sessions | Retrouver « comment on en est arrivé là » |
| `AGENTS.md` / `CODEX_BRIEFING.md` | **Obsolètes → pointent ici** | Ne plus utiliser |

---

## 1. Matériel

- **Robot** : Yahboom **ROSMASTER M3 PRO**. Calculateur = **Jetson Nano** (B01, ARM64).
  **CPU 4 cœurs faibles — c'est LA contrainte n°1 qui structure tout** (voir §7 et §8).
- Sur le Jetson tourne **Docker**. Toute la robotique vit dans des **containers**, pas sur l'hôte.
- **STM32** : pilote physiquement moteurs, servos (bras + pince), LEDs, buzzer, IMU, encodeurs.
  Il parle à ROS via **micro-ROS** (série + agent).
- 2 LiDAR (dual), 1 caméra RGB-D **Orbbec DaBai DCW2**, 1 bras 6 DOF + pince, batterie 3S Li-Ion (10.0 V vide → 12.6 V plein).

**Les 2 containers Docker permanents :**

| Container | Rôle |
|-----------|------|
| `m3pro` | ROS 2 Humble + drivers Yahboom + **notre** workspace `roblaude_ws` (bind-monté). On y lance toutes les commandes ROS. |
| `micro_ros_agent` | Pont **STM32 ↔ ROS 2**. Sans lui, aucune commande n'atteint moteurs/servos. |

**Branchements série STM32** (leçon dure) : le **STM32 = CP2104** (`10c4:ea60`), le micro-ROS agent = CH340 (`1a86`).
« Agent up mais pas de session » = mauvaise cible série, **PAS** un souci hardware.

---

## 2. Réseau — pourquoi Mac et robot ont des IP différentes

- **Mac** : `10.10.221.77`, netmask `/22` (`255.255.252.0`).
- **Robot** : IP **DHCP** qui change (dernières vues : `10.10.220.208`, puis **`10.10.221.45` au 2026-06-19**). MAC fixe = `50:3d:d1:ff:f3:7d`.

Un `/22` sur `10.10.220.0` couvre `10.10.220.0 → 10.10.223.255` → Mac et robot sont dans **le MÊME sous-réseau** (même LAN/Wi-Fi de l'école). Ils se parlent **directement**, sans routeur (ping ~8 ms).

**Pourquoi ça compte** : le robot doit joindre le **broker MQTT qui tourne sur le Mac**. Il lit l'IP du Mac dans `/etc/roblaude/broker_ip` (mis à jour par `sync_time.sh`). Le DHCP change les IP → `find_robot.sh` retrouve le robot par sa MAC.

---

## 3. Se connecter & contrôler le robot — le pattern OBLIGATOIRE

```bash
# 1. Trouver l'IP courante (DHCP)
./robot/scripts/find_robot.sh        # scanne le subnet, matche la MAC 50:3d:d1:ff:f3:7d

# 2. SSH (auth par mot de passe → sshpass). User: jetson / Password: yahboom
sshpass -p yahboom ssh -o StrictHostKeyChecking=accept-new jetson@<ip>
```

**Toute commande ROS passe DANS le container `m3pro`, avec 2 variables critiques :**

```bash
docker exec m3pro bash -lc '
  source /opt/ros/humble/setup.bash
  source /root/yahboomcar_ws/install/setup.bash     # drivers Yahboom (image)
  source /root/roblaude_ws/install/setup.bash        # NOTRE code (bind-monté)
  export ROS_DOMAIN_ID=30                             # OBLIGATOIRE
  export FASTDDS_BUILTIN_TRANSPORTS=UDPv4             # OBLIGATOIRE
  ros2 node list
'
```

⚠️ **Sans `ROS_DOMAIN_ID=30` + `FASTDDS_BUILTIN_TRANSPORTS=UDPv4`, les commandes n'atteignent jamais le STM32.** Cause n°1 de « ça ne répond pas ».

**Quoting SSH → docker (leçon dure)** : ne PAS empiler les guillemets. Utiliser le **heredoc littéral** :

```bash
ssh jetson@<ip> 'bash -s' <<'EOF'
docker exec -i m3pro bash -l <<'INNER'
source /opt/ros/humble/setup.bash; source /root/roblaude_ws/install/setup.bash 2>/dev/null
ros2 node list
INNER
EOF
```

Lancer un node/launch en fond : **`docker exec -d`** (jamais attaché — sinon le SSH timeout à 2 min). Relire l'état via les **fichiers de log** (`/tmp/roslogs/*.log`), plus robuste qu'une requête `ros2` live.

**Topics de contrôle :**

| Action | Topic | Type | Notes |
|--------|-------|------|-------|
| Déplacer la base | `/cmd_vel` | `geometry_msgs/Twist` | moteurs |
| Bras joints 1-5 | `/arm6_joints` | `arm_msgs/msg/ArmJoints` | servos bras |
| **Pince** | `/arm_joint` | `arm_msgs/msg/ArmJoint {id,joint,time}` | **id=6, 0=OUVERT, 180=FERMÉ** |
| Batterie (lecture) | `/battery` | `std_msgs/Float32` | tension brute (V) |
| Buzzer / LEDs | `/beep` / `/rgb` | — | utiles pour tester que le STM32 exécute |

**Déployer du code** : `./robot/scripts/deploy_to_robot.sh` (rsync `robot/roblaude_*` → `/home/jetson/roblaude_ws` puis `colcon build --symlink-install`). Les scripts (`*.sh`) n'ont pas besoin de build.

**Santé OK** [DÉDUIT] = ~**16 nodes**, 2 containers up, STM32 connecté, autostart 0 erreur.

---

## 4. Architecture web (les 3 couches)

```
web/frontend/   React 19.2 + Vite 7 + TS + Zustand 5 + PWA + Three.js (visu bras) + xterm (SSH)   (dev :5173)
web/backend/    Node 20 + Express 4 + Prisma 6.19 + MySQL + mqtt 5 + ws 8                          (:3001, PAS 3000)
robot/          ROS 2 Humble (Python) sur le Jetson
infra/          docker-compose : MySQL 8 + Mosquitto 2
```

- **Front ↔ Back** : REST (`web/frontend/src/lib/api.ts` ↔ `routes/*`) + **plusieurs WebSocket** (`wsRouter` → `wsTelemetry`, `wsTf`, `wsTopics`, `wsSsh`). Front a un terminal SSH (xterm) et une visu 3D du bras (Three.js + urdf-loader).
- **Back ↔ Robot** : **MQTT uniquement** (pas de REST/WS robot↔back).

**Lancer la web app en local** (testé) :
```bash
# MySQL sur 3307 (le .env backend vise localhost:3307, PAS 3306)
docker run -d --name roblaude-mysql -p 3307:3306 -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=roblaude -e MYSQL_USER=roblaude -e MYSQL_PASSWORD=roblaude mysql:8.0
# Broker MQTT anonyme (dev)
docker run -d --name roblaude-mosquitto -p 1883:1883 eclipse-mosquitto:2 \
  sh -c "printf 'listener 1883\nallow_anonymous true\n' > /mosquitto/config/mosquitto.conf && exec mosquitto -c /mosquitto/config/mosquitto.conf"
cd web/backend && npx prisma migrate deploy && npx tsx prisma/seed.ts && npm run dev   # Prisma 7 ne seed pas seul
cd web/frontend && npm run dev
```
- **Login** : `admin@roblaude.fr` / `changeme` (ADMIN) · `marie@roblaude.fr` / `changeme` (USER).
- Gotcha seed : plante sur `GraspObject.color` (branche non mergée) → `ALTER TABLE GraspObject ADD COLUMN color VARCHAR(191) NOT NULL DEFAULT '#ff0000';`.

**Détail stack backend** : `zod` 4, `jsonwebtoken`, `bcryptjs`, `node-ssh` + `ssh2` (terminal SSH), `sharp`, `yaml`. Coverage min **70 %** sur les controllers.
**CI** (`.github/workflows/ci.yml`) : 2 jobs — Frontend (eslint + build + test) et Backend (build + `prisma migrate deploy` + test). ⚠️ **Lire la conclusion par job**, pas l'exit global.

### 4.1 Structure du repo (réelle)

```
web/frontend/src/   pages(~10) components(~25 + ui/) stores(5 Zustand) hooks(5) lib(15) e2e/(5 specs)
web/backend/src/    routes/ controllers(11) services/ middleware/ prisma/ types/
                    services clés : mqtt.ts, websocket.ts, wsRouter→{wsTelemetry,wsTf,wsTopics,wsSsh},
                    sshConnection.ts, missionWatchdog.ts, mqttEvents.ts
robot/roblaude_nav/        launch(slam, nav2_slam_roblaude, explore, camera, lidar, tf2_static) +
                           mission_executor, mapping_supervisor, scan_restamper, odom_to_tf, initial_rotation
robot/roblaude_mqtt/       mqtt_bridge.py (pont MQTT↔ROS) + config + launch
robot/roblaude_pickplace/  détecteur HSV+depth + IK bras (arm_kin) + color.py + tests  (UC-02)
robot/m-explore-ros2/       TIERS vendored (explore_lite + map_merge)
robot/docs/                explore-stack.md, m3pro-reference.md (notre robot corrigé)
infra/mosquitto/           mosquitto.conf + acl + passwd.example  (passwd réel jamais commit)
```

⚠️ `bridge/` (annoncé dans le README) est **vide** — le vrai bridge est `robot/roblaude_mqtt`.

---

## 5. MQTT — le seul canal Back ↔ Robot

```
[React] --REST+WS--> [Backend Express] --MQTT--> [Mosquitto (sur le Mac, :1883)] <--MQTT-- [mqtt_bridge.py] <--ROS--> [nodes / STM32]
```

- Broker **sur le Mac**, port **1883**. En dev : **anonyme** (creds vides). Le robot lit l'IP du broker dans `/etc/roblaude/broker_ip`.
- `robot/roblaude_mqtt/roblaude_mqtt/mqtt_bridge.py` = le pont (un node ROS). Côté back : `web/backend/src/services/mqtt.ts`.
- **Contrat détaillé = `docs/mqtt-spec.md`** (le vrai schéma des payloads).

**Topics** (`{id}` = `Robot.id`, ici **1**) :

| Topic | Sens | QoS | Retained |
|-------|------|-----|----------|
| `roblaude/{id}/cmd/{mission,cancel,resume,loading-confirmed,emergency-stop}` | Back→Robot | 2 | non |
| `roblaude/{id}/telemetry/position` | Robot→Back | 0 | oui |
| `roblaude/{id}/telemetry/battery` | Robot→Back | 1 | oui |
| `roblaude/{id}/telemetry/scan` | Robot→Back | 0 | — |
| `roblaude/{id}/status` | Robot→Back | 1 | oui |
| `roblaude/{id}/mission/{ack,status,result}` | Robot→Back | 1/1/2 | non/oui/non |
| `roblaude/{id}/connection` | Robot→Back | 1 | oui |

Backend s'abonne en wildcard : `roblaude/+/telemetry/#`, `roblaude/+/status`, `roblaude/+/mission/#`, `roblaude/+/connection`.

**Flux mission** : front → REST → backend publie `cmd/mission {type,objectId,targetColor}` (QoS 2) → `mqtt_bridge` traduit en ROS → `mission_executor` (ActionClient Nav2 `/navigate_to_pose`) → robot publie `mission/ack` → `mission/status` (NAVIGATING→DETECTING→GRASPING→…→DEPOSITING) → `mission/result {completed | reason}` → backend → WebSocket → front.

---

## 6. Architecture robot (interne)

**Deux familles de workspaces sourcées ensemble :**
- `/root/yahboomcar_ws` (+ `/root/M3Pro_ws`) : **drivers Yahboom**, DANS l'image (intouchables). Fournissent `base_bringup` (moteurs, EKF odométrie, IMU, fusion LiDAR), `robot_state_publisher` (URDF), nav2, slam_toolbox, driver bras (`YB_Node`), driver caméra.
- `/root/roblaude_ws` : **NOTRE code**, bind-monté depuis `/home/jetson/roblaude_ws`. Packages :
  - `roblaude_nav` : `slam.launch`, `nav2_slam_roblaude.launch`, `explore.launch`, `scan_restamper`, `mission_executor`, `mapping_supervisor`, `tf2_static`, `initial_rotation`, `camera.launch`.
  - `roblaude_mqtt` : `mqtt_bridge.py`.
  - `roblaude_pickplace` : détecteur objet HSV+depth + IK bras (`arm_kin`) — UC-02.

**Arbre TF** : `map → odom → base_footprint → base_link → {laser, camera, arm_base, imu}`.
L'EKF (`base_bringup`) publie `odom→base_footprint`. slam_toolbox publie `map→odom`.

**Chaîne LiDAR / mapping (cartographiée et vérifiée 2026-06-18) [PROUVÉ] :**
```
/scan0 (laser0_frame) + /scan1 (laser1_frame)
   → laserscan_multi_merger → /scan_multi (base_link, ~7 Hz)
   → laser_filter_node      → /scan
   → scan_restamper         → /scan_fixed
   → slam_toolbox           → /map + TF map→odom
```
- slam_toolbox : `base_frame=base_footprint`, `scan_topic=/scan_fixed`, `transform_publish_period=0.02` (**= /tf à 50 Hz**, important pour §9), `minimum_time_interval=0.5`.
- **Bug drift TF résolu** : le LiDAR Yahboom estampille les scans **dans le futur** (mesuré +3.46 s) → slam droppe tout (« Message Filter dropping… queue is full »). Fix `scan_restamper` : republie avec **`now() - 0.2s`** (offset, pas `now()` brut sinon la TF odom EKF n'est pas encore dispo). Résultat : **0 drop** avec slam seul.
- **Visu** : `foxglove_bridge` sur le robot (port 8765) → depuis le Mac : `ws://<ip>:8765`.

**Au boot** : `robot/scripts/container_autostart.sh` (PID 1 du container) lance la stack. Modes : **`minimal`** (base + mqtt + mission, sans caméra/détecteur) et **`full`** (tout). `start_perception.sh` lance caméra+détecteur à la demande. Le bras est mis en HOME une fois YB_Node prêt (jamais en rafale).

### 6.1 Scripts robot (`robot/scripts/`) — rôle de chacun

| Script | Rôle |
|--------|------|
| `Docker_M3Pro_Joy.sh` | lance le container `m3pro` (→ `container_autostart`) — **cœur** |
| `container_autostart.sh` | PID 1 du container, lance la stack ROS au boot (modes minimal/full) — **cœur** |
| `deploy_to_robot.sh` | rsync packages + `colcon build` — **cœur** |
| `find_robot.sh` | trouve l'IP du robot par MAC — **cœur** |
| `sync_time.sh` | sync horloge Jetson + pousse l'IP broker (Mac) — **cœur** |
| `start_perception.sh` | lance caméra + détecteur à la demande (idempotent) |
| `start_agent.sh` | lance le container `micro_ros_agent` |
| `connect.sh` | SSH + noVNC rapide |
| `fetch_urdf_from_robot.sh` | récupère l'URDF pour le front (`backend/app.ts`) |
| `install_persistence.sh` | setup one-shot persistance |
| `start_all.sh` / `start_robot.sh` | démarrage manuel debug — **redondants** (supprimés sur la branche courante) |

### 6.2 UC-02 pick&place — détail

- **Codé + partiellement validé réel** : détecteur couleur 3D (caméra DaBai), pince réparée (`/arm_joint id=6`), bras joints 1-5, `mission_executor` PICK_AND_PLACE, `roblaude_pickplace`.
- **Détecteur** : `/roblaude/detections` à **10 Hz** (HSV + depth) ; couleur cible à chaud via `/roblaude/target_color` (testé objet bleu → x=0.025, y=0.025, z=0.174 m).
- **IK bras** (`arm_kin`) : portée 2-link loi des cosinus, `rad_to_servo` (0 rad → servo 90), **rejette** hors portée / joint > ±1.57 rad.
- **Contrat MQTT** : `cmd/mission {type:PICK_AND_PLACE, objectId, targetColor}` → `mission/ack` → `mission/status` (NAVIGATING→DETECTING→GRASPING→…→DEPOSITING) → `mission/result {completed | reason:grasp-failed}`. `targetColor` dérivé du hex `GraspObject.color`.
- **Reste** : valider grasp réel (batterie), recaler reset bras boot/shutdown, retirer `--device=/dev/video0` (inutile) de `Docker_M3Pro_Joy.sh`, test E2E + non-régression UC-01, PR.

---

## 7. ⚠️ Savoir robot appris à la dure (lire avant de toucher au robot)

- **CPU Jetson Nano très faible (4 cœurs).** `slam_toolbox` seul = load ~2, OK. **`nav2 + explore_lite` sature** → l'exploration autonome ne marche pas proprement sans optimisation (voir §9 pour la **vraie** cause racine, trouvée 2026-06-19).
- **`YB_Node` crashe sous un `ros2 topic pub` continu** → bras/moteurs muets jusqu'à **REBOOT**. Règle : **`--once`**, une commande à la fois, jamais de boucle de pub.
- **`pkill -f` se tue lui-même** si le motif apparaît en clair dans la commande → **bracket-trick** : `pkill -9 -f "[c]ontroller_server"`.
- **Bras OPEN-LOOP total** : aucun retour servo, `/joint_states` ne reflète pas une pose mise à la main. On impose des poses par commande.
- **Calibration bras (vérifiée réel)** : servo **90 = neutre/droit**. VERTICALE = `[90,90,90,90,90]`. HOME safe = `[90,120,10,20,90,0]` time=2000. joint2 (épaule) : 0=bas / 90=vertical / 180=arrière. joint3 (coude) : 90=droit / 0=plié.
- **PINCE** : topic `/arm_joint`, **id=6, 0=OUVERT / 180=FERMÉ** (le `joint6` de `/arm6_joints` ne fait PAS un open/close propre).
- **Caméra = Orbbec DaBai DCW2** (PAS astra_pro2). Launch `dabai_dcw2`. Au boot l'USB est frais → marche ; relance à chaud sur device occupé échoue (reboot résout).
- **Batterie** : topic `/battery`. ≥12 V = sain. **La lecture est faussée (timeout) quand le CPU sature** → batterie illisible = le Nano rame.
- **Horloge Jetson ~25 jours en retard** (casse `apt update`). `sync_time.sh` corrige. N'impacte pas le SLAM.
- **À NE PAS faire sans accord** : bouger le robot, publier sur `/cmd_vel`, lancer nav2+explore, `ros2 topic pub` en boucle.

---

## 8. Modes & stratégie automap (décision 2026-06-19)

Objectif : cartographier une pièce en autonomie, puis exécuter des missions pick&place (objets à QR code).
**Choix produit du codeur** : pendant l'automap, **garder mqtt + mission + détecteur**, **couper seulement la caméra** (le détecteur dort sans images → ~0 % CPU). La caméra ne s'allume qu'au moment de la mission.

---

## 9. Causes racines connues (investigations terminées) — section anti-divergence

> **Le cœur de ce doc.** Toute « cause connue » erronée ailleurs est corrigée ici, avec son niveau de preuve.

### 9.1 Bras « muet » puis « ne tient pas la pose » (session 2026-06-18)
- **Cause du bras muet [PROUVÉ]** : câble du **bus servo** du bras débranché/desserré. Après recâblage → le bras bouge (HOME + test mono-servo). Validé que le STM32 exécute bien (le **buzzer sonne**, les LEDs répondent) → ce n'était ni le logiciel, ni MQTT, ni l'USB, ni la config, ni un backup.
- **Pas de « torque enable » logiciel** [PROUVÉ] : les servos bus tiennent leur pose seuls (mode position). Aucun service/param `torque` exposé par YB_Node (vérifié : il n'écoute que `arm6_joints`/`arm_joint`/`beep`/`cmd_vel`/`rgb`). Le `/enable` du graphe appartient à l'EKF, rien à voir.
- **« Ne tient pas la pose » [DÉDUIT, non clos]** : très probablement batterie trop basse pour soutenir le couple (bouger ≠ tenir contre la gravité) et/ou contact bus servo encore marginal. À reconfirmer batterie chargée.

### 9.2 Capteurs / SLAM sous mouvement (session 2026-06-19) [PROUVÉ]
- Sous rotation réelle, **toute la chaîne LiDAR tient** : `/scan0`/`/scan1` ~7,14 Hz, `/scan_multi` 7,14, `/scan_fixed` 7,14, `/odom` ~6 Hz, **aucun trou**, **zéro « queue full »**, zéro « extrapolation error ».
- **Le « gel SLAM / scan silent » des sessions précédentes ne s'est PAS reproduit** → c'était un **contact USB intermittent du LiDAR**, réglé par le recâblage. La perception est saine.

### 9.3 `mqtt_bridge` CPU — FAUSSE PISTE, close par mesure propre (2026-06-19 soir) [PROUVÉ]
> ✅ **PISTE CLOSE.** Re-test rigoureux en **état propre (reboot + dual LiDAR)** : pendant un automap qui **fonctionne** (3 goals Nav2 atteints), **mqtt_bridge = 0 % CPU** (mesuré /proc). `/tf` à 60 Hz → mqtt_bridge **0 %** : `/tf` n'inonde RIEN. Le « 120 % » des mesures d'avant = **artefact d'état churné** (graph ROS malmené toute la session + `/scan0` mort). **Aucun fix mqtt nécessaire** (le fix `/tf` 50→20 Hz a été testé puis **reverté** : inutile). L'automap marche. Seul reste = slam « queue full » drops (§9.5), non fatal.
>
> _Leçon : ne jamais conclure une cause sur des mesures en état churné. La re-mesure en état propre a tout renversé._ Le détail ci-dessous est **l'historique de l'enquête** (gardé pour mémoire), pas la conclusion.
> ⚠️ Corrige aussi l'encore-plus-ancienne fiche « busy-loop 95 % broker absent » (fausse également).

- **[PROUVÉ]** Le CPU de `mqtt_bridge` est **piloté à 100 % par les messages entrants** : `0 %` quand ses topics sont silencieux, **~120 %** quand ils publient. Le broker est **connecté** (TCP ESTABLISHED Mac↔robot) — ce n'est donc pas un spin sur broker mort.
- **[PROUVÉ]** Chaîne d'élimination : `py-spy` → thread chaud dans `rclpy/executors.py:wait_for_ready_callbacks` (l'**attente de l'exécuteur**, pas les callbacks, pas paho/MQTT) · `strace` → **99,8 % userspace**, ~280 syscalls/s (donc **pas** un spin syscall/epoll, pas DDS sockets) · node rclpy **vide = 0 %** (rmw/DDS sain) · graphe ROS stable (pas de churn).
- **[PROUVÉ]** Aucun timer rclpy dans le bridge (le dead-man teleop est un `threading.Timer`, hors exécuteur). `robot_state_publisher` est dans la même famille (~49 %, piloté par `/joint_states`).
- **Cause racine [DÉDUIT, vérif d'isolation en cours]** : `mqtt_bridge` a **~17 souscriptions** sur un `SingleThreadedExecutor`. Le coût par-réveil de l'exécuteur rclpy Humble scale mal avec le nombre d'entités × le débit. En **automap**, slam inonde `/tf` à **50 Hz** + `/map` + `/scan_multi` + `/plan` + `/explore/frontiers` → le mono-thread se fait inonder → **1 cœur brûlé** → **Nav2 affamé → action servers ne répondent plus (timeouts) → pas d'exploration**.
- **Fix proposé (pas encore appliqué, à valider par mesure)** : (1) slam `transform_publish_period` 0.02→0.05 (50→20 Hz). (2) `mqtt_bridge` : remplacer la souscription `/tf` brute par un **lookup TF périodique à 5 Hz** (préserve la pose web sans inonder l'exécuteur). Validation = re-mesurer le CPU de `mqtt_bridge` pendant l'automap.
- **NOTE** : la « magnitude exacte par topic » reste **[DÉDUITE]** tant que le test d'injection contrôlée (`/tf` synthétique à 50/20 Hz → mesure CPU) n'est pas terminé.

---

### 9.4 La VRAIE cause des galères automap (2026-06-19 soir) — PRÉREQUIS [PROUVÉ]

Re-test en état propre : **l'automap FONCTIONNE** (Nav2 atteint des goals, exploration autonome, 3 goals en 80 s). Les « galères » des sessions d'avant (Nav2 timeout, scans qui droppent, mqtt_bridge 120 %) étaient des **artefacts de 2 conditions dégradées**, pas un bug logiciel — vérifié en relisant toutes les commandes : **aucun changement de code n'a touché le robot**, il a tourné sur le code d'origine du début à la fin.

1. **Batterie basse** (~10,6–10,8 V) → moteurs faibles (« failed to make progress » = le robot ne bouge pas assez) + Nano qui brownout → lectures CPU faussées (« batterie illisible = le Nano rame »).
2. **État ROS churné** (dizaines de launch/pkill, zombies) + **`/scan0` mort** (dual LiDAR dégradé) → scans incomplets, mqtt_bridge transitoire à 120 %.

**Ce qui a tout réparé ce soir : batterie chargée (12,5 V) + reboot à froid** (vide le churn + ré-énumère `/scan0`). **Zéro ligne de code.**

> ⚠️ **PRÉREQUIS AVANT TOUTE SESSION AUTOMAP/NAV (non négociable) :**
> 1. **Batterie ≥ 12 V** (sinon moteurs faibles + brownout → on debug des fantômes).
> 2. **Reboot à froid** (état ROS propre + ré-énumération USB des 2 LiDARs).
> Tant que ces 2 points ne sont pas faits, **ne pas chercher de fix code** — c'est quasi toujours batterie/état, pas le logiciel.

### 9.5 Reste réel (mineur) : slam « queue full » drops

Sous charge automap, slam_toolbox logue « Message Filter dropping… queue is full » par intermittence. **Non fatal** (map→odom reste frais, les goals passent). Piste de polish si besoin : `scan_buffer_size` / la file du message_filter tf2. Pas prioritaire — l'automap marche.

## 10. Dette & bugs ouverts (détail dans `docs/DETTE.md`)

- 🐛 Le bridge publie `Infinity` dans le JSON du scan (`telemetry/scan`) → JSON invalide, backend rejette. À sanitiser (`inf` → `null`).
- 🐛 `GraspObject.color` pas mergé sur `dev` → seed/page objets plantent sans le `ALTER TABLE`.
- 🔧 `mission_executor`/`mqtt_bridge` publient sur `/cmd_vel` au repos → conflit téléop. Ne publier que pendant une mission active.
- 🔌 Auth MQTT : générer `infra/mosquitto/passwd` + creds (là c'est anonyme).
- 🔋 Batterie/chargeur : blocage matériel possible, à régler physiquement (viser ≥12 V).

---

## 11. Conventions (NON négociable)

- **Langue** : toujours répondre **en français**. Commentaires de code en français.
- **Commits** : `type(scope): desc` sur **une seule ligne**, style humain. Scopes : `frontend backend robot infra ci mqtt ws db`. **Jamais `git commit`/`gh pr create` direct → toujours le skill `/commit`.**
- **Mots IA BANNIS** (commits + commentaires) : implement / enhance / ensure / leverage / streamline / robust / scalable / facilitate / utilize / comprehensive / sophisticated / « This commit… » / « This function… ». Pas de `cf.` ni renvois `§X` dans le code.
- **Git** : 1 ticket = 1 branche (`feat/T…`) = 1 PR. Toujours partir de `dev`. Jamais merge direct. Commits atomiques. Hook `git-guard` bloque commit/push sur `main`/`dev`.
- **Rigueur** (cf. CLAUDE.md global) : standard « 1+1=2 » — vérifier avant d'affirmer, étiqueter PROUVÉ/DÉDUIT/SUPPOSÉ, isoler la variable avant d'agir, anti-tunnel.

---

## 12. État git & branches (au 2026-06-16, à rafraîchir via `git`)

| Branche | État |
|---------|------|
| `dev` / `main` | base, à jour origin |
| `feat/uc02-robot` | UC-02 robot complet, **poussée** |
| `feat/uc02-graspobject-color` | backend `GraspObject.color` + `targetColor`, **poussée** |
| `fix/explore-tf-drops` | fix restamper committé (`2117dc1`), **pas poussée** |
| `feat/T8.4.1-automap-explore` | **branche courante** : mode minimal, arm HOME au boot, tuning explore, scripts (NON commité au 2026-06-19) |

> Commits robot souvent dans des **worktrees** → committer avec `git -C <worktree> …`.

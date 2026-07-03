# ROBOT.md — Faits robot RobLaude (sourcés)

> Généré le 2026-06-17. Doc **uniquement factuel** : chaque ligne porte sa source `fichier:ligne`
> ou la commande git exacte. `[MANQUANT]` = non trouvé dans le repo. `[DÉDUIT]` = inféré, à confirmer.
> État du repo : branche `dev`. Le travail UC-02 robot vit sur des branches non mergées (§8).

---

## 0. État des sources

- **Avant ce fichier, pas de doc robot canonique unique** : le savoir etait eparpille entre
  `robot/README.md`, `robot/docs/explore-stack.md`, `robot/CLAUDE.md`, `AGENTS.md`,
  `CODEX_BRIEFING.md`, `docs/STATUS.md`, `docs/CHECKPOINT.md`, `docs/journal/*` et
  `docs/DETTE.md`.
- Docs robot existants :
  - `robot/README.md` (87 lignes, **tracké**) — sections : stack, roblaude_nav, launch, nodes, scripts, notes matérielles.
  - `robot/docs/explore-stack.md` (156 lignes, **tracké**).
  - `robot/CLAUDE.md` (62 lignes, **non tracké**).
  - `AGENTS.md` + `CODEX_BRIEFING.md` (racine, **non trackés**) — briefings robot détaillés mais hors git.
- Verdict : doc robot **partiel et dispersé**, en partie hors git.

---

## 1. Accès robot

- **User SSH** : `jetson` — `robot/scripts/connect.sh:9`, `robot/scripts/sync_time.sh:20`, `robot/scripts/deploy_to_robot.sh:23` (`ROBOT_USER="${ROBOT_USER:-jetson}"`).
- **Password SSH** : `yahboom` — `robot/scripts/connect.sh:27`, `robot/scripts/sync_time.sh:21` (`ROBOT_PASS="${ROBOT_PASS:-yahboom}"`).
- **IP** : **non fixe** — résolue dynamiquement par MAC. `robot/scripts/find_robot.sh:19` : `ROBOT_MAC="${ROBOT_MAC:-50:3d:d1:ff:f3:7d}"`. Un exemple d'IP figure en commentaire (`sync_time.sh:13` : `10.10.220.109`) — **exemple, pas l'IP réelle**.
- **MAC Jetson** : `50:3d:d1:ff:f3:7d` — `robot/scripts/find_robot.sh:19`.
- **noVNC** : port `6080` — `robot/scripts/connect.sh:24`.
- **Hostname** : `[MANQUANT dans le repo]` — observé en session via `hostname` = `jetson-desktop`, mais non présent dans un fichier du repo.
- **Registry Docker privé** : `192.168.2.51:5000` — `robot/scripts/Docker_M3Pro_Joy.sh:69`, `robot/scripts/start_agent.sh:8`.
- **Image container ROS** : `192.168.2.51:5000/rosmaster-m3pro-nano:1.1.0` — `Docker_M3Pro_Joy.sh:69`.
- **Image micro-ROS agent** : `192.168.2.51:5000/micro-ros-agent:humble` — `start_agent.sh:8`.
- **Bind-mounts** (hôte → container) — `Docker_M3Pro_Joy.sh` :
  - `/home/jetson/roblaude_ws` → `/root/roblaude_ws` (`:62`)
  - `/home/jetson/robot_maps` → `/root/maps` (`:63`)
  - `/home/jetson/.local` → `/root/.local` (`:64`)
- **Fichier IP broker côté robot** : `/etc/roblaude/broker_ip`, écrit par `sync_time.sh:69`.

---

## 2. Stack ROS2

- **Distro** : `humble` — `container_autostart.sh:43` (`source /opt/ros/humble/setup.bash`), `deploy_to_robot.sh:79`, `start_agent.sh:8`.
- **Packages présents sur `dev`** (tous `ament_python`) :
  - `roblaude_nav` v`0.1.0` — `robot/roblaude_nav/package.xml:4-5`, build_type `:36`.
  - `roblaude_mqtt` v`0.1.0` — `robot/roblaude_mqtt/package.xml:4-5`, build_type `:29`.
- **`roblaude_pickplace` : ABSENT de `dev`** — présent uniquement sur `feat/uc02-robot` (§8). Source : `git ls-tree -r dev` → 0 fichier ; `git ls-tree -r feat/uc02-robot` → 15 fichiers.
- **Nodes (console_scripts)** :
  - `roblaude_mqtt` : `mqtt_bridge` — `robot/roblaude_mqtt/setup.py:29`.
  - `roblaude_nav` : `scan_restamper`, `odom_to_tf`, `mission_executor`, `initial_rotation`, `mapping_supervisor` — `robot/roblaude_nav/setup.py:29-33`.
- **Launch (`roblaude_nav/launch/`)** : `camera`, `explore`, `foxglove`, `lidar`, `nav2`, `odom`, `slam`, `teleop`, `tf2_static`, `web_video` (`.launch.py`) — listés par `find`.
- **Launch (`roblaude_mqtt/launch/`)** : `mqtt_bridge.launch.py`.
- **Topics réels du bridge** (`roblaude_mqtt/mqtt_bridge.py`) :
  - Sub : `/odom` (`:204`), `/battery` (`:207`), `/map` (`:223`), `/scan_multi` (`:224`), `/plan` (`:225`), `/explore/frontiers` (`:226`), `/tf` (`:227`), caméra compressée (`:235`), `JointState` (`:236`).
  - Pub : `/arm6_joints` (`:191`), `/cmd_vel` Twist (`:242`), `/mqtt/cmd/mapping` (`:243`).

---

## 3. Réseau / env ROS

- **`ROS_DOMAIN_ID=30`** : **PROUVÉ** —
  - `robot/scripts/container_autostart.sh:24` : `export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-30}"`
  - `robot/scripts/Docker_M3Pro_Joy.sh:57` : `-e ROS_DOMAIN_ID=30`
  - `robot/roblaude_nav/roblaude_nav/odom_to_tf.py:16` (commentaire export).
- **`FASTDDS_BUILTIN_TRANSPORTS=UDPv4`** : **PROUVÉ** —
  - `container_autostart.sh:25` : `export FASTDDS_BUILTIN_TRANSPORTS="${FASTDDS_BUILTIN_TRANSPORTS:-UDPv4}"`
  - `Docker_M3Pro_Joy.sh:58` : `-e FASTDDS_BUILTIN_TRANSPORTS=UDPv4`.
- **Broker MQTT (defaults bridge)** : `broker_host: "localhost"`, `broker_port: 1883`, `robot_id: 1`, `mqtt_user: ""` — `robot/roblaude_mqtt/config/mqtt_bridge.yaml:5-8`.

---

## 4. Déploiement — `robot/scripts/deploy_to_robot.sh`

Étapes prouvées (numéros de ligne du script) :
1. Source `find_robot.sh` pour obtenir l'IP par MAC — `:21`.
2. Flag `--no-build` = deploy sans build — `:29`.
3. `rsync` des packages vers `/home/jetson/roblaude_ws` (`WS_HOST` `:25`), `--delete-after`, exclut `.git`/`build`/`install`/`log` — `:58-60`.
4. `rsync` des scripts — `:68`.
5. `colcon build --symlink-install` **dans le container**, après `source /opt/ros/humble/setup.bash` + `source /root/yahboomcar_ws/install/setup.bash` — `:79-82`.
6. Le workspace est visible dans le container via bind-mount — `:89`.

---

## 5. Démarrage / arrêt — `robot/scripts/container_autostart.sh`

- Pose `ROS_DOMAIN_ID=30` + `FASTDDS_BUILTIN_TRANSPORTS=UDPv4` — `:24-25`.
- Source `/opt/ros/humble/setup.bash` — `:43`.
- Lance (`spawn_once`) :
  - `base_bringup` : `ros2 launch M3Pro_navigation base_bringup.launch.py` — `:85`.
  - `mqtt_bridge` (si build présent) — `:99`.
  - `mission_executor` (si build présent) — `:109`.
- **`slam_toolbox` désactivé dans l'autostart** : commenté avec la note « slam_toolbox bloque "queue full" -> pas de mapping. On le coupe. » — `:93-94`.
- Arrêt propre : `trap` SIGTERM/INT qui `pkill` les enfants — `:119`.
- **[DÉDUIT — à confirmer]** : sur le robot en session, `object_detector` + caméra **tournaient** (snapshot process `…/roblaude_pickplace/lib/roblaude_pickplace/object_detector`), alors que cet autostart de `dev` ne les lance PAS. → Le robot exécute une version d'autostart issue de `feat/uc02-robot` (§8), pas celle de `dev`.

---

## 6. Sécurité (batterie, env, /cmd_vel)

- **Bornes batterie (code)** : `BATTERY_EMPTY_V = 10.0`, `BATTERY_FULL_V = 12.6` — `robot/roblaude_mqtt/mqtt_bridge.py:94-95`. Ce sont les bornes d'**interpolation du pourcentage**, pas un seuil de blocage.
- **Topic `/battery`** : `Float32` (YB_Node) — `mqtt_bridge.py:207`.
- **Seuil « ≥12 V avant mouvement »** : **[DÉDUIT / convention documentée — PAS un seuil dans le code]**
  - `AGENTS.md:122` : « ≥12 V = sain ».
  - `CODEX_BRIEFING.md:193` : « Vérifier la batterie avant tout mouvement (`/battery`, viser ≥12 V) ».
  - → Aucune ligne de code n'empêche le mouvement sous 12 V. C'est une **règle humaine**, pas un garde-fou logiciel. (Ces deux fichiers sont **non trackés**.)
- **`/cmd_vel` à 2 publishers** : **PROUVÉ** — `mission_executor.py:53` ET `mqtt_bridge.py:242` créent chacun un publisher Twist sur `/cmd_vel`. Conflit possible au repos.
- **`ROS_DOMAIN_ID=30` + `FASTDDS=UDPv4` obligatoires** : voir §3 (prouvé). Conséquence « sinon les commandes n'atteignent pas le STM32 » = documentée (`AGENTS.md`), pas dans le code.

### 6bis. Bras — canaux d'actionnement (RÉSOLU — testé 2026-06-17, câble STM32 neuf)

**Les DEUX canaux actionnent le bras** (observé en session, STM32 sain) :
- `/arm6_joints` (`arm_msgs/ArmJoints`, batch — **canal Yahboom officiel**) : pose complète joints 1-5 → **bouge** ✅. C'est le canal utilisé par `mission_executor._send_arm` (`mission_executor.py:413`) + le bridge → **OK pour UC-02**.
- `/arm_joint` (`arm_msgs/ArmJoint`, single-servo) : pince id=6 (0=ouvert / 180=fermé) **et** joints id=1..5 → **bougent** ✅.
- `YB_Node` est abonné aux deux topics (quand le STM32 est connecté).

→ **Canal standard retenu : `/arm6_joints` (méthode A)** — fait exactement la pose voulue, déjà câblé dans `mission_executor`/bridge. (`/arm_joint` = utile pour la pince et le debug single-servo.)

**⚠️ LEÇON (important)** : un test `/arm6_joints` plus tôt le même jour n'avait **rien bougé** → c'était un **FAUX NÉGATIF**. En réalité le **câble USB du STM32 était en train de lâcher** (il a complètement coupé peu après : kernel « Cannot enable. Maybe the USB cable is bad? », `/dev/myserial` disparu, `YB_Node`/`/battery` morts). **Quand le lien STM32 est sain, `/arm6_joints` marche.**
→ **Règle de diag** : si le bras (ou la batterie, ou les moteurs) ne répond pas, **vérifier D'ABORD le lien STM32** avant de soupçonner les topics :
`lsusb | grep 10c4:ea60` · `/dev/myserial` présent · `micro_ros_agent` « session established » · `/battery` publie · `YB_Node` dans `ros2 node list`.

---

## 7. Diagnostic (outils présents dans le repo)

- **`robot/scripts/find_robot.sh`** : retrouve l'IP par MAC (scan ARP) — `:60-62`.
- **`robot/scripts/sync_time.sh`** : sync horloge Jetson + pousse l'IP broker dans `/etc/roblaude/broker_ip` — `:44-69`.
- **`robot/roblaude_mqtt/tools/mqtt_smoke_test.py`** : test bout-en-bout MQTT (publie/écoute `roblaude/1/telemetry/battery`, etc.) — `:140-236`.
- Commandes ROS de diagnostic live (`ros2 node list`, `ros2 topic echo /battery --once`) : **[observées en session, non présentes comme script dans le repo]**.

---

## 8. Travail sur les branches non mergées (committé + poussé sauf indication)

Source : `git diff --name-status dev..<branche> -- robot/` et `git grep <branche>`.

### `feat/uc02-robot` — UC-02 pick&place robot (poussée sur origin)
- **Nouveau package `roblaude_pickplace`** (15 fichiers) :
  - Node `object_detector` — `setup.py:29`.
  - `arm_kin.py` (IK bras → publie `/arm6_joints`, `package.xml:10`), `color.py`, `detection.py`.
  - Config `detection_params.yaml` : `target_color: "#ff0000"` par défaut — `:14`.
  - Topics `object_detector.py` : sub images color/depth/info + `/roblaude/target_color` (`:88`) ; pub `/roblaude/detections` PoseArray (`:90`) + `/roblaude/detection_image` (`:92`).
  - Launch `pickplace.launch.py` + tests (`test_arm_kin`, `test_color`, `test_detection`).
- **Modifie** : `roblaude_nav/launch/camera.launch.py`, `roblaude_nav/package.xml`, `roblaude_nav/mission_executor.py`, `scripts/Docker_M3Pro_Joy.sh`, `scripts/container_autostart.sh`, `robot/README.md`.

### `fix/explore-tf-drops` — fix SLAM (commit `2117dc1`, **NON poussée**)
- **Modifie** `robot/roblaude_nav/roblaude_nav/scan_restamper.py` (restamp `now()-0.2s`).
- ⚠️ Sur **aucun remote** → travail uniquement local (worktree `roblaude-mapping`).

### `feat/arm-control-camera-live` — contrôle bras + caméra (poussée sur origin)
- **Modifie** `roblaude_mqtt/mqtt_bridge.py`, `roblaude_mqtt/test/test_arm_command.py`, `scripts/fetch_urdf_from_robot.sh`.

---

## 9. Dette / Bugs / Risques

### 9.1 Bugs confirmés (sourcés code ou session)
- **`/cmd_vel` à 2 publishers au repos** — `mission_executor.py:53` + `mqtt_bridge.py:242`. Risque : conflit avec le téléop. (PROUVÉ)
- **Bras open-loop** : `/joint_states` publie `0.0` sur tous les joints — **confirmé en session** (`ros2 topic echo /joint_states --once`). Impact : pose réelle illisible, d'où le « mirror mode » front (PR #264).
- **Auth MQTT absente** : `mqtt_user: ""`, `mqtt_password: ""` — `robot/roblaude_mqtt/config/mqtt_bridge.yaml:8-9` (TODO explicite `:9` « injecter via secret »). Broker en anonyme.

### 9.2 Bugs documentés — à revérifier contre le code
- **Busy-loop 95 % CPU quand broker absent** — `CODEX_BRIEFING.md:127`, `AGENTS.md:190`. **[À CONFIRMER]** : le code `dev` a pourtant `reconnect_delay_set(min_delay=1, max_delay=30)` + `loop_start()` (`mqtt_bridge.py:275,278`) → peut-être déjà mitigé, à mesurer sur le robot.
- **`Infinity` dans le JSON du scan** (`telemetry/scan`) — `CODEX_BRIEFING.md:128`, `AGENTS.md:191`. **[DÉDUIT]** : non localisé explicitement dans `mqtt_bridge.py` ; vient probablement des `ranges` LaserScan (valeurs `inf`) sérialisées. À sanitiser.
- **Anomalie pince `joint6`** (open/close KO) — `docs/CHECKPOINT.md` §5 (doc). Voir aussi [MANQUANT] sur le canal pince.
- **YB_Node crash sous rafales `ros2 topic pub`** → reboot — `AGENTS.md` (doc). Règle : `--once`, jamais de boucle.
- **#257 — `/mapping` écran noir sans WebGL** (frontend) — observé en session (chromium headless) ; error-boundary OK dans un vrai navigateur.

### 9.3 Risques / incohérences trouvés en session
- **Autostart `dev` ≠ autostart robot** : `container_autostart.sh` de `dev` ne lance que `base_bringup` + `mqtt_bridge` + `mission_executor` (`container_autostart.sh:84-110`), tandis que la session robot du 2026-06-17 a montre camera + detector actifs et un autostart plus lourd (`docs/journal/2026-06-17_session.md:27-32`). **[DÉDUIT — à confirmer]** : le robot tourne probablement une variante issue de `feat/uc02-robot`.
- **Travail robot hors `dev`** (§8) : `roblaude_pickplace` vit sur `feat/uc02-robot` (§8) et `scan_restamper` sur `fix/explore-tf-drops` (`git branch -vv`, `git worktree list`, `git log --branches --not --remotes`). Un déploiement naïf depuis `dev` perd ces deux briques.
- **`fix/explore-tf-drops` (`2117dc1`) non poussé** → perte possible si disque perdu (`git log --branches --not --remotes --oneline --decorate`, `git stash list`).
- **`GraspObject.color` est un memo obsolet** : le schema Prisma courant met `color` sur `Annotation` (`web/backend/prisma/schema.prisma:169-186`), pas sur `GraspObject` (`:51-59`). Les notes `AGENTS.md:92-93` et `docs/DETTE.md:28-30` sont donc stale sur ce point.
- **`robot/README.md` est stale** sur la structure : il annonce `roblaude_arm`, `roblaude_vision`, `roblaude_sim` et `start_all.sh`/`start_robot.sh` (`robot/README.md:9-15`, `:71-79`), alors que le code reel suit `roblaude_nav` + `roblaude_mqtt` + `roblaude_pickplace` sur branche.

### 9.4 Reste à faire (jour du robot, batterie ≥ 12 V)
Source : `docs/DETTE.md` (synthèse de session). Items robot :
- Recaler la **calibration bras** deg→rad par joint contre le vrai bras (HOME/Salut/Vertical) — `docs/DETTE.md` §2.
- **Nettoyer `/cmd_vel`** : `mission_executor` publie un Twist zero sur emergency stop (`robot/roblaude_nav/roblaude_nav/mission_executor.py:53,183-188`) et `mqtt_bridge` publie aussi `/cmd_vel` pour `teleop` (`robot/roblaude_mqtt/roblaude_mqtt/mqtt_bridge.py:242,245-249,332-349`). Conflit reel au repos.
- **Mode mapping léger** : validé en session 2026-06-17. Carte `roblaude_map` sauvée sur robot + Mac (`312 x 261`, `0.05 m/px`, origine `[-8.21, -8.72]`, ~15.6 x 13 m). Methode : base + `slam.launch.py` + teleop clavier → `map_saver`. Supporté par `AGENTS.md:114-115`, `robot/roblaude_nav/launch/explore.launch.py:1-14`, `robot/roblaude_nav/launch/slam.launch.py:29-33`.
- **Nav2 sans `explore_lite`** : validé en session 2026-06-17, sans envoyer de goal. Nodes Nav2 actifs (`controller_server`, `planner_server`, `bt_navigator`, `behavior_server`, `smoother`, `velocity_smoother`, `lifecycle_manager`), costmaps global/local construites, `/navigate_to_pose` disponible. Le Nano tient `slam + nav2` ; le point lourd reste `explore_lite`.
- **Autonav sur carte sauvée / SLAM live** : le premier goal retour A a été accepté puis `ABORTED` en session 2026-06-17. Logs observés : drops `Message Filter` côté costmaps + `GridBased failed to create plan with tolerance 0.50`. Correctif préparé : `robot/roblaude_nav/launch/nav2_slam_roblaude.launch.py` génère des params Nav2 depuis le YAML Humble installé, coupe l'obstacle live de la `global_costmap`, met la `local_costmap` sur `/scan_fixed`, ralentit les vitesses et monte la tolérance planner. Prochaine étape = tester un goal très court en zone blanche avant de retenter `Accueil`/`Bureau`.
- **Carte figée AMCL** : toujours non câblée. `robot/roblaude_nav/launch/nav2.launch.py` reste un launch Nav2 sans `amcl` ni `map_server` (`robot/roblaude_nav/launch/nav2.launch.py:1-20`). À faire seulement après validation du replay SLAM live.
- **Lever l'anomalie / conflit pince** : le code courant de l'API bras dit `joint6: 0 = ferme, 180 = ouvert max` (`web/backend/src/controllers/armController.ts:9-18, 40-63`), idem le frontend (`web/frontend/src/components/ArmController.tsx:7-10, 26-34`), mais `AGENTS.md:119` et `CODEX_BRIEFING.md:76` disent l'inverse. A trancher sur le robot avant toute demo bras.
- **Nettoyer le travail local** : `robot/scripts/start_all.sh` et `robot/scripts/start_robot.sh` sont supprimes dans `dev`, avec plusieurs untracked locaux (`git status --short --branch`).
- **Sauver le fix SLAM** : `fix/explore-tf-drops` porte `2117dc1` et n'est pas pousse (`git log --branches --not --remotes --oneline --decorate`, `git stash list`).

### 9.5 Etat de fin de session
- `dev` contient maintenant le merge PR `#264` (bras 3D miroir + proxy `/robot_assets`) : `git log` montre `2e6e9a1` sur `dev`, et `docs/journal/2026-06-17_session.md:103-114` dit la PR mergée.
- `docs/STATUS.md:7-12` reste en mode "Sprint 3 navigation + Sprint 4 prepare" ; le journal du 2026-06-17 montre que le projet a depasse cet etat. Le status est donc partiellement stale.
- `docs/journal/2026-06-17_session.md:21-33, 36-41, 45-64, 68-72` couvre le diagnostic read-only, la chaine MQTT Robot->Broker->Backend->Front, le fix `/robot_assets`, le mode miroir du bras, puis le fix du test #007.

---

## 10. Où on en est (état projet — 2026-06-17)

> Source : `gh issue list`, `gh pr list`, `git log` exécutés le 2026-06-17.

**Issues GitHub** : **116 fermées / 72 ouvertes** (188 total) → ~61,7 % fermées (`gh issue list --state open|closed`).

Ouvertes par milestone (`gh issue list --state open --json milestone`) :
- Sprint 8 — Tests & Hardware : **16**
- Sprint 9 — Soutenance : **15**
- Sprint 6 — MoveIt2 & Vision : **14**
- Sprint 7 — UC-02 Pick & Place : **13**
- Sprint 5 — UC-01 E2E : **7**
- Sprint 3 — Navigation : **3** · (sans milestone) : **3** · Sprint 2 — Web MVP : **1**

**PR** : **aucune ouverte**. 8 dernières mergées (`gh pr list --state merged`) :
- `#264` 2026-06-16 — bras 3D miroir + fix proxy urdf
- `#263` / `#262` 2026-06-15 — UC-02 front (page objets) + back (CRUD/watchdog)
- `#261` 2026-06-15 — suite E2E mobile + UC-01 + arrêt d'urgence
- `#260` 2026-06-15 — migrations Prisma manquantes (mapping/SSH)
- `#256` 2026-06-15 — bras presets Yahboom · `#255`/`#254` 2026-05-22 — bras+caméra+publishers

**Lecture côté robot :**
- Mergé sur `dev` : web UC-02 (`#263`+`#262`), bras 3D + presets (`#255`/`#256`/`#264`), publishers caméra/joint_states (`#254`).
- **Robot UC-02** (détection objet, IK bras) : **non mergé**, vit sur `feat/uc02-robot` (§8) → Sprint 7 robot pas sur `dev`.
- ⚠️ **Désynchro issues/code** : Sprint 6 (14 open) et Sprint 7 (13 open) ont des issues ouvertes alors que du code existe (mergé ou sur branche) — cf `AUDIT_REPORT.md` §4. Beaucoup d'open Sprint 8/9 = hardware réel + soutenance, non clôturables sans présentiel robot.
- **Dernière session** : `docs/journal/2026-06-17_session.md` (diag read-only + PR #264).

---

## 11. Git local utile pour le robot (2026-06-17)

- **Branche courante** : `dev` = `2e6e9a1` (`origin/dev`) — PR `#264` mergée (`git branch -vv`).
- **`feat/arm-mirror-urdf`** : branche supprimée apres merge ; ses commits sont dans `dev` (`4fb0a3c`, `82c8f54`, `3ffece3`) et la PR `#264` est fermee/mergee (`git log --oneline --decorate --graph --all -n 40`).
- **Branches / worktrees actifs** (`git branch -vv`, `git worktree list`) :
  - `feat/uc02-robot` (`d3c0615`, worktree `roblaude-uc02`, pousse sur `origin/feat/uc02-robot`)
  - `feat/uc02-graspobject-color` (`32e5a73`, pousse sur `origin/feat/uc02-graspobject-color`)
  - `fix/explore-tf-drops` (`2117dc1`, worktree `roblaude-mapping`, non pousse)
  - `fix/web-bugs-257-258` (`507838b`, worktree `roblaude-web`, local)
  - `feat/arm-control-camera-live` (`d1b0ed2`, pousse sur `origin/feat/arm-control-camera-live`)
- **Commit local non pousse** : `2117dc1` (`git log --branches --not --remotes --oneline --decorate`).
- **Stash** : `stash@{0}` = WIP persistance robot / paho-mqtt (`git stash list`).
- **Working tree `dev`** : suppressions non commitees `robot/scripts/start_all.sh`, `robot/scripts/start_robot.sh` + untracked `.codex/`, `AGENTS.md`, `AUDIT_REPORT.md`, `CODEX_BRIEFING.md`, `docs/CHECKPOINT.md`, `docs/DETTE.md` (`git status --short --branch`).

---

## [MANQUANT] — à fournir par Wissem

- **Hostname robot** dans le repo (observé `jetson-desktop`, non sourcé).
- **Seuil batterie de blocage réel** : aucune valeur de garde-fou dans le code (seul « ≥12 V » documenté).
- **Canal physique exact de la pince sur le robot** : le code API bras/front utilise `joint6` dans `/api/robots/:id/arm` et `mqtt_bridge` relaie vers `/arm6_joints`, mais la confirmation IRL du servo qui bouge reste a refaire sur robot.
- **Carte seed de navigation** : `roblaude_map.{pgm,yaml}` existe localement apres la session 2026-06-17, mais reste a décider si elle doit être versionnée ou gardée comme artefact local.

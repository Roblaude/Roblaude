# robot/ — Stack ROS2 RobLaude

Code ROS2 Humble du robot RobLaude (Yahboom ROSMASTER M3 PRO, Jetson Nano).

## Architecture (cf `docs/architecture.md`)

```
robot/
├── roblaude_nav/      # Navigation autonome — SLAM + Nav2          [Sprint 3]
├── roblaude_pickplace/      # Contrôle bras 6 DOF — MoveIt2              [Sprint 6]  (à venir)
├── roblaude_vision/   # Détection objets — OpenCV                  [Sprint 6]  (à venir)
├── roblaude_mqtt/     # Bridge MQTT ↔ ROS2                         [Sprint 4]  (à venir)
├── roblaude_sim/      # Configs Gazebo (monde, modèles)            (à venir)
└── scripts/           # Outils host (connexion, déploiement)
```

## roblaude_nav — Navigation (Sprint 3)

Package ROS2 `ament_python`. Contient la cartographie SLAM, la navigation Nav2,
les drivers capteurs et les outils de visualisation.

### Launch files (`roblaude_nav/launch/`)

| Fichier | Rôle |
|---|---|
| `lidar.launch.py` | YDLidar 2D → `/scan` |
| `camera.launch.py` | Caméra Orbbec DaBai DCW2 RGB-D → `/camera/*` |
| `odom.launch.py` | Odométrie roues + IMU STM32 |
| `tf2_static.launch.py` | Transforms statiques châssis ↔ capteurs |
| `slam.launch.py` | SLAM Toolbox (cartographie temps réel → `/map`) |
| `nav2.launch.py` | Navigation autonome Nav2 |
| `teleop.launch.py` | Téléopération clavier → `/cmd_vel` |
| `foxglove.launch.py` | Bridge Foxglove Studio (WebSocket :8765) |
| `web_video.launch.py` | Flux caméra HTTP MJPEG (:8080) |

### Nodes Python (`roblaude_nav/roblaude_nav/`)

| Node | Rôle |
|---|---|
| `scan_restamper` | Re-timestampe `/scan` et `/odom_raw` (l'horloge du STM32 n'est pas synchronisée — sinon SLAM rejette les scans) |
| `odom_to_tf` | Publie le TF dynamique `odom → base_link` à partir de `/odom_raw` |

### Compilation

```bash
# Dans un workspace ROS2 (ex: ~/roblaude_ws/src/)
cd ~/roblaude_ws
colcon build --packages-select roblaude_nav
source install/setup.bash
```

### Lancement

```bash
# Cartographie SLAM
ros2 launch roblaude_nav lidar.launch.py
ros2 launch roblaude_nav odom.launch.py
ros2 launch roblaude_nav slam.launch.py

# Visualisation Foxglove Studio
ros2 launch roblaude_nav foxglove.launch.py   # puis ws://<ROBOT_IP>:8765

# Tout d'un coup (sur le robot)
bash scripts/start_all.sh
```

## scripts/ — Outils host (hors ROS2)

Lancés depuis le Mac/PC, pas dans le container ROS2.

| Script | Rôle |
|---|---|
| `find_robot.sh` | Trouve l'IP du robot par son adresse MAC (résiste au DHCP) |
| `start_robot.sh` | Démarrage tout-en-un : détecte l'IP, sync l'horloge, lance la stack |
| `start_all.sh` | Lance toute la stack ROS2 (à exécuter dans le container) |
| `deploy_to_robot.sh` | Déploie le code vers le robot via rsync |
| `connect.sh` | SSH + noVNC vers le robot |
| `Docker_M3Pro_Joy.sh` | Lance le container ROS2 principal (nom fixe `m3pro_main`) |
| `start_agent.sh` | (legacy) lancement manuel de l'agent micro-ROS — remplacé par le service systemd |
| `install_microros_service.sh` | Installe l'agent micro-ROS en service systemd + healthcheck (à lancer sur le Jetson) |
| `roblaude-link-stm32.sh` | Lie `/dev/myserial` au STM32 (CP210x), jamais au CH340 (micro) |
| `roblaude-stm32-healthcheck.sh` | Vérifie la session STM32, capture le diag et relance l'agent si KO |

## Notes matérielles

- **Horloge** : le Jetson Nano n'a pas de RTC → il perd l'heure à chaque extinction.
  `start_robot.sh` resynchronise l'horloge à chaque démarrage.
- **Caméra** : c'est une **Orbbec DaBai DCW2** (et non une RealSense comme indiqué
  initialement dans le CDC).
- **LiDAR** : le M3 PRO produit 2 demi-scans (`/scan0` + `/scan1`) fusionnés en `/scan`.
- **Série / STM32** : il y a **deux** adaptateurs USB-série. Le STM32 (base, batterie,
  moteurs, bras) est un **CP2104 = `10c4:ea60`** → c'est lui que `/dev/myserial` doit
  viser. Le **CH340 = `1a86`** est le **micro** (`speech.rules` le mappe sur `/dev/mic`).
  Ne jamais pointer l'agent micro-ROS sur le CH340. L'ordre `ttyUSB0/1` change au boot,
  donc on keye sur la puce, pas sur le numéro. Symptôme du mauvais port : l'agent affiche
  `running... fd: 3` puis plus rien, `YB_Node` absent, `/battery` muet — **ce n'est pas
  un problème de câble**, c'est la cible série.
- **Persistance** : `install_microros_service.sh` installe l'agent en service systemd
  (relink + restart auto) + un healthcheck (timer 2 min) qui capture le diag dans
  `/var/log/roblaude/` à chaque incident.

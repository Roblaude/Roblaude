# Stack exploration auto — référence stack robot

> Documente la stack ROS2 complète pour le mode mapping autonome RobLaude.
> Validée en réel le 22 mai 2026 — robot bouge en autonome avec explore_lite.

---

## Vue d'ensemble

```
LiDAR0 (laser0_frame) ─┐
                       ├─> laserscan_multi_merger ─> /scan_multi ─┐
LiDAR1 (laser1_frame) ─┘   (Yahboom ira_laser_tools)              │
                                                                  │
                              base_bringup.launch.py              │
                              ├── ekf_filter_node ──> /odom + TF odom→base_link
                              ├── robot_state_publisher ──> /tf_static (URDF)
                              ├── joint_state_publisher
                              └── imu_filter                       │
                                                                  ▼
                                          ┌───────── scan_restamper.py
                                          │         (roblaude_nav)
                                          │         FIX drift +500ms drivers LiDAR
                                          ▼         re-stamps msg.header.stamp = now()
                                    /scan_fixed
                                          │
                                          ▼
                                   slam_toolbox (async)
                                   - scan_topic: /scan_fixed
                                   - base_frame: base_footprint
                                   - mode: mapping
                                          │
                                          ▼
                                   /map  +  TF map→odom
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                       Nav2 (navigation_launch.py)   explore_lite
                       - sans amcl, sans map_server   - costmap_topic: map
                       - lifecycle s'active           - frontier_size: 0.3
                              │                       │
                              │              Goal /navigate_to_pose
                              │◀──────────────────────┘
                              ▼
                         /cmd_vel ──> moteurs Yahboom (YB_Node)
```

---

## Comment lancer

Le container m3pro démarre automatiquement (via `robot/scripts/container_autostart.sh`) :
- `base_bringup.launch.py` (drivers hardware, IMU, lidars, EKF)
- `mqtt_bridge.launch.py` (bridge MQTT vers backend RobLaude)
- `mission_executor` (recoit cmd MQTT, drive Nav2)

Pour démarrer le mode mapping/exploration auto :

```bash
ssh jetson@10.10.220.208
docker exec -it m3pro bash
source /opt/ros/humble/setup.bash
source /root/M3Pro_ws/install/setup.bash
source /root/roblaude_ws/install/setup.bash
ros2 launch roblaude_nav explore.launch.py
```

Le robot va alors :
1. Lancer `scan_restamper` + `slam_toolbox` (mapping mode)
2. Lancer Nav2 (planner, controller, costmaps, behaviors)
3. Faire une rotation initiale 360° (16.7s) pour amorcer SLAM
4. `explore_lite` détecte les frontières et envoie des goals à Nav2
5. Robot navigue vers les frontières → cartographie ce qu'il découvre

Sauvegarder la carte :
```bash
ros2 run nav2_map_server map_saver_cli -f /root/maps/<nom>
```

Stopper proprement :
```bash
# Dans le shell qui a lancé ros2 launch : Ctrl+C
# OU depuis l'extérieur :
docker exec m3pro pkill -SIGINT -f explore.launch.py
```

---

## 3 bugs résolus le 22 mai 2026 (fix `T3.5.0`)

### Bug A — `nav2.launch.py` lançait `bringup_launch.py` (mode localization)

`bringup_launch.py` include `amcl` + `map_server` qui cherche `/home/jetson/maps/default.yaml`. Comme ce fichier n'existe pas, `lifecycle_manager_localization` aborte tout le bringup Nav2 → controller_server etc. jamais activés → robot immobile.

**Fix** : remplacer par `navigation_launch.py` (mode mapping pur, slam_toolbox externe fournit `/map`). Cf `nav2.launch.py`.

### Bug B — Doublon `robot_state_publisher` + `joint_state_publisher`

`container_autostart.sh` lançait 2 launch files Yahboom en parallèle (`base_bringup.launch.py` + `display_launch.py`) qui chacun spawn rsp + jsp → conflit QoS `transient_local` sur `/tf_static` → cache DDS cassé → toute la chaîne TF dysfonctionnelle (slam_toolbox ne trouve pas les frames).

**Fix** : commenter la ligne `spawn_once rsp ros2 launch yahboom_M3Pro_description display_launch.py` dans `container_autostart.sh`. `base_bringup` lance déjà rsp+jsp avec l'URDF complet (14 frames dans `/tf_static`).

### Bug C — Drivers LiDAR Yahboom publient timestamps **+500ms futur**

Mesuré au mini-script Python `rclpy` : `/scan0` et `/scan1` publient avec `header.stamp` dans le **futur de ~470-580ms** (drift constant). `laserscan_multi_merger` propage ce drift sur `/scan_multi`.

**Conséquence sur slam_toolbox** : le message_filter interne attend une TF `base_footprint → map` au temps `stamp` (futur). La TF cache (publiée en wall time) n'a jamais d'entrée dans le futur → le filter garde le scan en queue → queue déborde → **drop infini** → aucun scan jamais matché → pas de TF map→odom → Nav2 ne peut pas planifier → robot immobile.

**Fix** : `scan_restamper.py` (roblaude_nav, refactoré 22 mai) souscrit à `/scan_multi`, ré-écrit `msg.header.stamp` = `now()`, republie sur `/scan_fixed`. `slam.launch.py` configure `slam_toolbox` avec `scan_topic: /scan_fixed`.

Sub-fix complémentaire dans `slam.launch.py` : `base_frame: base_footprint` (PAS `base_link` qui causait chicken-and-egg pour la TF initiale).

---

## Frames TF de référence

`/tf_static` (publié par `robot_state_publisher`, URDF Yahboom) :

```
base_footprint
└── base_link
    ├── imu_frame
    ├── laser0_frame  (LiDAR avant)
    ├── laser1_frame  (LiDAR arrière)
    └── arm_base_Link
        └── arm1 → arm2 → arm3 → arm4 → arm5
                                        └── Gripping
```

`/tf` dynamique (publié par `ekf_filter_node`) :
```
map ── (publié par slam_toolbox une fois SLAM démarré)
└── odom ── (publié par ekf_filter_node, fusion odom + IMU)
    └── base_footprint
```

---

## Troubleshooting

| Symptôme | Cause probable | Fix |
|---|---|---|
| `Failed to bring up all requested nodes` (map_server) | `nav2.launch.py` utilise `bringup_launch.py` au lieu de `navigation_launch.py` | Vérifier le include dans `nav2.launch.py` |
| `Invalid frame ID "map" does not exist` (Nav2 logs) | slam_toolbox n'a pas pu matcher de scan → pas de TF map→odom | Vérifier que `scan_restamper` tourne ET que `slam_toolbox` consomme `/scan_fixed` |
| `Message Filter dropping... queue is full` infini | Drift timestamp /scan_multi pas corrigé | `scan_restamper` doit tourner. Mesurer drift avec `drift_monitor.py` |
| 2× `robot_state_publisher` dans `ros2 node list` | `display_launch.py` Yahboom est lancé (doublon) | `pkill -f display_launch.py` + vérifier `container_autostart.sh` ne le lance pas |
| Tests slam ratent mais explore.launch.py marche | Vérifier les params `slam_toolbox` cohérents entre `slam.launch.py` (notre) et `mapper_params_online_async.yaml` (Yahboom) |

---

## Références

- Fix-set commit : branche `fix/T3.5.0-explore-tf-slam` (4 commits)
- Spec mode-mapping (local) : `docs/superpowers/specs/2026-05-22-mode-mapping-design.md` §14
- Yahboom slam config validée : `/root/M3Pro_ws/src/slam_mapping/config/mapper_params_online_async.yaml`
- ROS2 slam_toolbox doc : https://github.com/SteveMacenski/slam_toolbox

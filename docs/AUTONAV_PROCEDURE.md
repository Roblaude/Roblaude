# Procédure de test autonav (Nav2) — RobLaude M3 Pro

> Préparée à froid le 2026-06-18. À dérouler demain, robot chargé (**batterie ≥ 12 V**).
> Objectif : valider le correctif `nav2_slam_roblaude.launch.py` qui avait fait
> `ABORTED` / `GridBased failed to create plan` la dernière fois.

## Ce qui a été corrigé (et pourquoi ça plantait)

1. **Bug bloquant trouvé en prep** : le launch lisait `controller['goal_checker']`,
   mais sous Humble le bloc s'appelle **`general_goal_checker`** → `KeyError` au
   lancement (vérifié sur le vrai fichier du robot, dans le container). Corrigé :
   on suit `goal_checker_plugins` / `progress_checker_plugin`, robuste cross-version.
2. **global_costmap** sans obstacle live → fin des drops `MessageFilter` globaux
   (on planifie sur la `static_layer` du SLAM).
3. **local_costmap** sur `/scan_fixed` (scan restampé par `scan_restamper`).
4. **planner** `GridBased.tolerance` 0.5 → **1.0** (évite "failed to create plan").
5. **controller** lent et tolérant : `max_vel_x 0.12`, `xy_goal_tolerance 0.35`.

La logique est testée (`test_nav2_overrides.py`, 6 tests) et validée sur le
fichier réel du robot (aucun KeyError, valeurs correctes).

## Pré-requis (dans l'ordre)

1. **Batterie ≥ 12 V** (sinon moteurs capricieux). Vérifier sur la page Réparation
   ou `ros2 topic echo /battery --once`.
2. Lien STM32 OK : `YB_Node` présent (page Réparation = tout vert).
3. Dans le container `m3pro` :
   - `base_bringup` lancé (odom + EKF + TF `odom->base_link`).
   - `slam.launch.py` lancé → `scan_restamper` (/scan_multi→/scan_fixed) + slam_toolbox.
   - Vérifier que **TF `map->odom`** existe et que **`/map`** publie :
     `ros2 topic hz /scan_fixed` (~7 Hz) · `ros2 topic echo /map --once`.

## Lancement Nav2

```bash
# dans le container m3pro, env ROS_DOMAIN_ID=30 + FASTDDS_BUILTIN_TRANSPORTS=UDPv4
ros2 launch roblaude_nav nav2_slam_roblaude.launch.py
```

Vérifier que les nodes montent et passent **active** :
```bash
ros2 node list | grep -E "controller_server|planner_server|bt_navigator|behavior_server"
ros2 lifecycle get /planner_server   # -> active
```

## Test progressif (NE PAS sauter d'étape)

**Étape 1 — goal très court, zone blanche connue (~0,5 m devant).**
Envoyer un goal proche, dans une zone déjà cartographiée et libre :
```bash
ros2 topic pub --once /goal_pose geometry_msgs/PoseStamped \
  "{header: {frame_id: 'map'}, pose: {position: {x: 0.5, y: 0.0, z: 0.0}, orientation: {w: 1.0}}}"
```
- Surveiller : `ros2 topic echo /cmd_vel` (le robot doit avancer doucement),
  les logs `bt_navigator` (pas de `ABORTED`), pas de `failed to create plan`.
- **Garder la main sur l'arrêt d'urgence** (bouton page mission / `cmd/emergency-stop`).

**Étape 2 — goal moyen (1–2 m) dans la même zone.** Même surveillance.

**Étape 3 — point nommé court** (ex. un point proche défini en base), puis
seulement après succès : **Accueil / Bureau**.

## Si ça re-`ABORTED`

- `ros2 topic echo /plan --once` : un plan est-il produit ? (sinon = planner)
- Drops `Message Filter` dans les logs costmap → vérifier `/scan_fixed` à ~7 Hz et
  la TF `odom->base_link` (EKF) bien présente.
- `GridBased failed to create plan` malgré tolérance 1.0 → goal probablement dans
  l'inconnu/obstacle : viser plus court, en zone blanche.
- Augmenter au besoin `stamp_offset` du restamper (`-p stamp_offset:=0.3`).

## Rollback

Le launch ne modifie rien de façon permanente (il génère un YAML temporaire à
chaque run). Pour revenir au comportement par défaut : ne pas lancer ce launch.

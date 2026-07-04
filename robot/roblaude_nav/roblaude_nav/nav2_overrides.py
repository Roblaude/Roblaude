"""Overrides Nav2 RobLaude appliques au nav2_params.yaml Humble.

Logique PURE (dicts only) -> testable sans ROS. Le launch
nav2_slam_roblaude.launch.py charge le YAML installe, appelle apply_overrides(),
puis passe le fichier patche a navigation_launch.py.

Corrections issues du vrai M3 Pro (retour A 'ABORTED' + drops MessageFilter) :
  - global_costmap sans obstacle live (planifie sur la static_layer du SLAM) ;
  - local_costmap sur /scan_fixed (scan restampe par scan_restamper) ;
  - planner/controller plus tolerants, vitesses reduites pour les 1ers goals.

Pourquoi defensif (.get / noms de plugins) : on patche un YAML EXTERNE dont les
cles dependent de la version Nav2. Sous Humble le goal checker s'appelle
"general_goal_checker" (PAS "goal_checker") -> un acces direct planterait le
launch en KeyError. On suit donc goal_checker_plugins / progress_checker_plugin.
"""


def set_use_sim_time_false(node_params):
    """Force use_sim_time=False recursivement (hardware reel, pas de /clock)."""
    if not isinstance(node_params, dict):
        return
    rp = node_params.get('ros__parameters')
    if isinstance(rp, dict):
        rp['use_sim_time'] = False
    for value in node_params.values():
        if isinstance(value, dict):
            set_use_sim_time_false(value)


def _patch_scan_layer(costmap, layer):
    if layer not in costmap:
        return
    costmap[layer]['observation_sources'] = 'scan'
    costmap[layer].setdefault('scan', {})
    costmap[layer]['scan']['topic'] = '/scan_fixed'
    costmap[layer]['scan']['data_type'] = 'LaserScan'
    costmap[layer]['scan']['marking'] = True
    costmap[layer]['scan']['clearing'] = True


def apply_overrides(params):
    """Applique les corrections RobLaude au dict de params Nav2 (mutation en place)."""
    set_use_sim_time_false(params)

    # global_costmap : pas d'obstacle live -> plus de drop MessageFilter global.
    # Le SLAM publie /map + TF map->odom, donc on planifie sur la static_layer.
    global_cm = params['global_costmap']['global_costmap']['ros__parameters']
    global_cm['global_frame'] = 'map'
    global_cm['robot_base_frame'] = 'base_link'
    global_cm['transform_tolerance'] = 1.0
    global_cm['plugins'] = ['static_layer', 'inflation_layer']
    global_cm['always_send_full_costmap'] = True
    if 'static_layer' in global_cm:
        global_cm['static_layer']['map_subscribe_transient_local'] = True

    # local_costmap : dynamique, mais lit /scan_fixed (scan restampe).
    local_cm = params['local_costmap']['local_costmap']['ros__parameters']
    local_cm['global_frame'] = 'odom'
    local_cm['robot_base_frame'] = 'base_link'
    local_cm['transform_tolerance'] = 1.0
    local_cm['rolling_window'] = True
    local_cm['width'] = 3
    local_cm['height'] = 3
    local_cm['always_send_full_costmap'] = True
    _patch_scan_layer(local_cm, 'obstacle_layer')
    _patch_scan_layer(local_cm, 'voxel_layer')

    # Rythme un peu reduit pour Jetson Nano. On baisse d'environ 25 % les
    # boucles critiques au lieu de brider fortement le robot.
    bt = params.get('bt_navigator', {}).get('ros__parameters', {})
    bt['bt_loop_duration'] = 13
    bt['default_server_timeout'] = 2000

    planner_server = params.get('planner_server', {}).get('ros__parameters', {})
    planner_server['expected_planner_frequency'] = 15.0

    behavior = params.get('behavior_server', {}).get('ros__parameters', {})
    behavior['cycle_frequency'] = 7.5

    smoother = params.get('velocity_smoother', {}).get('ros__parameters', {})
    smoother['smoothing_frequency'] = 15.0

    global_cm['update_frequency'] = 0.75
    global_cm['publish_frequency'] = 0.75
    local_cm['update_frequency'] = 3.75
    local_cm['publish_frequency'] = 1.5

    # controller : lent + tolerant pour les 1ers goals.
    controller = params['controller_server']['ros__parameters']
    controller['controller_frequency'] = 7.5

    pc_name = controller.get('progress_checker_plugin', 'progress_checker')
    if pc_name in controller:
        controller[pc_name]['required_movement_radius'] = 0.15
        controller[pc_name]['movement_time_allowance'] = 20.0

    # Humble : bloc "general_goal_checker" (pas "goal_checker"). On suit la liste.
    for gc_name in controller.get('goal_checker_plugins', ['general_goal_checker']):
        if gc_name in controller:
            # compromis pick&place : 0.35 laissait l'objet hors champ camera,
            # 0.15 fait mouliner l'approche finale (stiction moteurs bas voltage)
            controller[gc_name]['xy_goal_tolerance'] = 0.22
            controller[gc_name]['yaw_goal_tolerance'] = 0.35

    follow = controller.get('FollowPath')
    if follow:
        follow['max_vel_x'] = 0.09
        follow['max_speed_xy'] = 0.09
        follow['max_vel_theta'] = 0.34
        follow['acc_lim_x'] = 0.38
        follow['decel_lim_x'] = -0.38
        follow['acc_lim_theta'] = 0.75
        follow['decel_lim_theta'] = -0.75
        follow['transform_tolerance'] = 1.0

    # planner : tolerance 1.0m -> evite "GridBased failed to create plan with tolerance 0.50".
    planner = params['planner_server']['ros__parameters']
    if 'GridBased' in planner:
        planner['GridBased']['tolerance'] = 1.0

    return params

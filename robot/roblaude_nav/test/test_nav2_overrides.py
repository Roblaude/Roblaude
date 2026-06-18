"""Tests purs des overrides Nav2 (pas de ROS requis)."""

from roblaude_nav.nav2_overrides import apply_overrides, set_use_sim_time_false


def humble_params():
    # mini params Nav2 avec les VRAIES cles Humble (general_goal_checker, voxel_layer...)
    return {
        'global_costmap': {'global_costmap': {'ros__parameters': {
            'use_sim_time': True,
            'plugins': ['static_layer', 'obstacle_layer', 'inflation_layer'],
            'static_layer': {'map_subscribe_transient_local': False},
            'obstacle_layer': {},
        }}},
        'local_costmap': {'local_costmap': {'ros__parameters': {
            'use_sim_time': True,
            'plugins': ['voxel_layer', 'inflation_layer'],
            'voxel_layer': {'observation_sources': 'scan', 'scan': {'topic': '/scan'}},
        }}},
        'controller_server': {'ros__parameters': {
            'use_sim_time': True,
            'progress_checker_plugin': 'progress_checker',
            'goal_checker_plugins': ['general_goal_checker'],
            'controller_plugins': ['FollowPath'],
            'progress_checker': {'required_movement_radius': 0.5, 'movement_time_allowance': 10.0},
            'general_goal_checker': {'xy_goal_tolerance': 0.25, 'yaw_goal_tolerance': 0.25},
            'FollowPath': {'max_vel_x': 0.26, 'max_vel_theta': 1.0},
        }},
        'planner_server': {'ros__parameters': {'GridBased': {'tolerance': 0.5}}},
    }


def test_patch_les_vraies_cles_humble():
    p = humble_params()
    apply_overrides(p)  # ne doit PAS lever de KeyError sur 'goal_checker'
    c = p['controller_server']['ros__parameters']
    assert c['general_goal_checker']['xy_goal_tolerance'] == 0.35
    assert c['general_goal_checker']['yaw_goal_tolerance'] == 0.5
    assert c['progress_checker']['movement_time_allowance'] == 20.0
    assert c['controller_frequency'] == 10.0
    assert c['FollowPath']['max_vel_x'] == 0.12
    assert p['planner_server']['ros__parameters']['GridBased']['tolerance'] == 1.0


def test_local_costmap_lit_scan_fixed():
    p = humble_params()
    apply_overrides(p)
    lc = p['local_costmap']['local_costmap']['ros__parameters']
    assert lc['voxel_layer']['scan']['topic'] == '/scan_fixed'


def test_global_costmap_sans_obstacle_live():
    p = humble_params()
    apply_overrides(p)
    gc = p['global_costmap']['global_costmap']['ros__parameters']
    assert gc['plugins'] == ['static_layer', 'inflation_layer']
    assert gc['static_layer']['map_subscribe_transient_local'] is True


def test_use_sim_time_force_false():
    p = humble_params()
    apply_overrides(p)
    assert p['controller_server']['ros__parameters']['use_sim_time'] is False
    assert p['global_costmap']['global_costmap']['ros__parameters']['use_sim_time'] is False


def test_defensif_si_bloc_goal_checker_absent():
    # si le bloc nomme n'existe pas, pas de crash (robustesse cross-version)
    p = humble_params()
    del p['controller_server']['ros__parameters']['general_goal_checker']
    apply_overrides(p)  # ne doit pas lever


def test_set_use_sim_time_false_recursif():
    d = {'a': {'ros__parameters': {'use_sim_time': True}}, 'b': {'c': {'ros__parameters': {'use_sim_time': True}}}}
    set_use_sim_time_false(d)
    assert d['a']['ros__parameters']['use_sim_time'] is False
    assert d['b']['c']['ros__parameters']['use_sim_time'] is False

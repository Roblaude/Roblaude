"""localization.launch.py — localisation sur carte FIGEE (AMCL), pas de SLAM.

A lancer APRES avoir mappe + sauve une carte (map_saver_cli). Le robot se
localise sur la carte sauvee SANS la modifier : on peut le bouger / l'eteindre,
au demarrage il se re-repere via le LiDAR (probleme du "kidnapped robot").
=> c'est le mode normal d'usage. Le mapping (slam.launch.py) ne sert qu'a
   (re)construire la carte, ponctuellement.

Chaine : /scan_multi -> scan_restamper -> /scan_fixed -> amcl
         map_server charge roblaude_map.yaml -> /map (latche)
         amcl publie la correction map->odom (comme slam, mais sans toucher la carte)

Pre-requis : base_bringup (odom->base_footprint via EKF) + LiDAR (/scan_multi).

Usage :
    ros2 launch roblaude_nav localization.launch.py
    ros2 launch roblaude_nav localization.launch.py map:=/home/jetson/maps/roblaude_map.yaml
"""
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    map_arg = DeclareLaunchArgument(
        'map',
        default_value='/home/jetson/maps/roblaude_map.yaml',
        description='Carte sauvee (.yaml) sur laquelle se localiser',
    )
    map_yaml = LaunchConfiguration('map')

    lifecycle_nodes = ['map_server', 'amcl']

    return LaunchDescription([
        map_arg,

        # restampe les scans (drift +futur du LiDAR Yahboom) -> /scan_fixed,
        # sinon amcl droppe tout comme slam (message filter / queue full).
        Node(
            package='roblaude_nav',
            executable='scan_restamper',
            name='scan_restamper',
            output='screen',
        ),

        # charge la carte figee -> topic /map (latche transient_local)
        Node(
            package='nav2_map_server',
            executable='map_server',
            name='map_server',
            output='screen',
            parameters=[{
                'use_sim_time': False,
                'yaml_filename': map_yaml,
                'topic_name': 'map',
                'frame_id': 'map',
            }],
        ),

        # AMCL : se localise sur la carte via le LiDAR, publie map->odom.
        # Ne modifie JAMAIS la carte (contrairement a slam_toolbox).
        Node(
            package='nav2_amcl',
            executable='amcl',
            name='amcl',
            output='screen',
            parameters=[{
                'use_sim_time': False,
                'base_frame_id': 'base_footprint',   # comme slam (cf slam.launch.py)
                'odom_frame_id': 'odom',
                'global_frame_id': 'map',
                'scan_topic': '/scan_fixed',
                'robot_model_type': 'nav2_amcl::DifferentialMotionModel',
                'laser_model_type': 'likelihood_field',
                'min_particles': 500,
                'max_particles': 2000,
                'laser_min_range': 0.3,
                'laser_max_range': 4.0,
                'max_beams': 60,
                'update_min_d': 0.15,                # rafraichit des qu'on bouge un peu
                'update_min_a': 0.15,
                'transform_tolerance': 1.0,
                'tf_broadcast': True,
                # pose initiale = origine par defaut ; si on a deplace le robot,
                # appeler /reinitialize_global_localization (ou donner une pose).
                'set_initial_pose': True,
                'initial_pose': {'x': 0.0, 'y': 0.0, 'z': 0.0, 'yaw': 0.0},
            }],
        ),

        # active map_server + amcl (lifecycle)
        Node(
            package='nav2_lifecycle_manager',
            executable='lifecycle_manager',
            name='lifecycle_manager_localization',
            output='screen',
            parameters=[{
                'use_sim_time': False,
                'autostart': True,
                'node_names': lifecycle_nodes,
            }],
        ),
    ])

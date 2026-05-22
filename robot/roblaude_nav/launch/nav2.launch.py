"""
nav2.launch.py — Stack Nav2 PURE (mode mapping live).

Lance uniquement les nodes de navigation (planner, controller, smoother,
costmaps, behavior_tree, bt_navigator) sans amcl ni map_server.
La carte /map est fournie en live par slam_toolbox (cf slam.launch.py).

PRE-REQUIS :
  - base_bringup Yahboom up (moteurs, lidar, ekf qui publie odom→base_link)
  - slam.launch.py lance ou autre source de /map et TF map→odom

Topics/Actions :
    /navigate_to_pose (action)  : envoyer un goal (x, y, yaw)
    /cmd_vel                    : commandes de vitesse pour les roues
    /plan                       : trajectoire planifiee

Pourquoi navigation_launch.py et pas bringup_launch.py :
    bringup_launch include amcl + map_server qui cherche un default.yaml
    inexistant -> FATAL. navigation_launch est la version mapping-friendly.
"""

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    return LaunchDescription([
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('nav2_bringup'),
                    'launch',
                    'navigation_launch.py',
                ])
            ]),
            launch_arguments={
                'use_sim_time': 'false',
            }.items(),
        ),
    ])

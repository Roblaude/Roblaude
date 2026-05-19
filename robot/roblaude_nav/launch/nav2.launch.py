"""
nav2.launch.py — Navigation autonome (Nav2)

Lance la stack Nav2 complete pour naviguer vers un goal.

PRE-REQUIS :
  - lidar.launch.py + odom.launch.py + tf2_static.launch.py lances
  - Une carte sauvegardee dans ~/maps/<nom>.yaml (via slam.launch.py puis map_saver_cli)
  - OU en mode SLAM live (mapping en meme temps)

Usage :
    ros2 launch /path/to/nav2.launch.py map:=/home/jetson/maps/salon.yaml

Topics/Actions :
    /navigate_to_pose (action)  : envoyer un goal (x, y, yaw)
    /cmd_vel                    : commandes de vitesse pour les roues
    /plan                       : trajectoire planifiee (visualisable dans RViz)

Nav2 est livre par Yahboom dans /root/yahboomcar_ws/src/M3Pro_navigation/
donc on reutilise son launch officiel pour beneficier de leur config.
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('map', default_value='/home/jetson/maps/default.yaml',
                              description='Chemin absolu vers le fichier .yaml de la carte'),

        # Include le launch officiel de Nav2 (bringup_launch.py)
        # Si Yahboom a un launch custom, on peut le remplacer par :
        # FindPackageShare('M3Pro_navigation')
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('nav2_bringup'),
                    'launch',
                    'bringup_launch.py'
                ])
            ]),
            launch_arguments={
                'map': LaunchConfiguration('map'),
                'use_sim_time': 'false',
            }.items()
        ),
    ])

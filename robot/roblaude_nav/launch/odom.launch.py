"""
odom.launch.py — Demarre l'odometrie du ROSMASTER M3 PRO

L'odometrie estime la position du robot en integrant :
  - Encodeurs des roues (distance parcourue)
  - IMU interne du STM32 (orientation)

Le STM32 publie deja /odom via le micro-ros-agent. Ce launch ajoute juste
les transforms tf2 pour que odom -> base_link soit publie.

Usage :
    ros2 launch /path/to/odom.launch.py

Topics consommes / publies :
    /odom (nav_msgs/Odometry)       <- publie par le STM32 via micro-ros
    tf /odom -> /base_link          <- publie par ce node
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # Note : l'odometrie est publiee par le STM32 lui-meme via micro-ros.
        # On ajoute juste le transform odom -> base_link si besoin.
        # En general, c'est un node qui lit /odom et publie le TF correspondant.

        # Placeholder node si Yahboom a un "odom_publisher" dans son workspace
        # A adapter selon ce qu'on trouve dans /root/yahboomcar_ws/src/
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='odom_identity',
            # Transform initial odom -> base_link (sera remplace par le dynamic publisher)
            # Ici c'est juste un fallback si aucun node ne publie le vrai tf
            arguments=['0', '0', '0', '0', '0', '0', 'odom', 'base_link'],
        ),
    ])

"""
tf2_static.launch.py — Publie les transforms STATIQUES du robot

Un Static Transform = relation fixe entre deux reperes (ne bouge jamais).
Ex: le LiDAR est soude sur le chassis a 10 cm au-dessus du centre.

Sans ces transforms, SLAM/Nav2 ne peuvent pas situer les capteurs.

Arbre tf (statique) apres ce launch :
    base_link                 <- centre du robot
    +-- laser_link            <- position LiDAR
    +-- camera_link           <- position camera
    +-- arm_base_link         <- base du bras

NB: les positions sont fixes (capteurs soudes au chassis). Valeurs
approximatives pour le ROSMASTER M3 PRO — a affiner avec les vraies mesures.
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # base_link -> laser_link (LiDAR, 10 cm au-dessus du centre)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_laser',
            arguments=['0.0', '0.0', '0.10', '0', '0', '0',
                       'base_link', 'laser_link'],
        ),

        # base_link -> camera_link (camera RGB-D)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_camera',
            arguments=['0.10', '0.0', '0.08', '0', '0', '0',
                       'base_link', 'camera_link'],
        ),

        # base_link -> arm_base_link (base du bras 6 DOF)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_arm',
            arguments=['0.05', '0.0', '0.05', '0', '0', '0',
                       'base_link', 'arm_base_link'],
        ),
    ])

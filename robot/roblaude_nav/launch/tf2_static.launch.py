"""
tf2_static.launch.py — Publie les transforms STATIQUES du robot

Un Static Transform = relation fixe entre deux repères (ne bouge jamais).
Ex: le LiDAR est soude sur le chassis a 10 cm au-dessus du centre.

Sans ces transforms, SLAM/Nav2 ne peuvent pas situer les capteurs.

Arbre tf (statique) apres ce launch :
    base_link                 <- centre du robot
    +-- laser_link            <- position LiDAR
    +-- camera_link           <- position camera
    +-- arm_base_link         <- base du bras

Arguments (tous optionnels) :
    lidar_xyz  : "x y z" du LiDAR (m) — defaut "0.0 0.0 0.10"
    camera_xyz : "x y z" de la camera (m) — defaut "0.10 0.0 0.08"
    arm_xyz    : "x y z" de la base du bras (m) — defaut "0.05 0.0 0.05"

NB: les valeurs sont approximatives — a affiner avec les vraies mesures du M3 PRO.
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # Arguments configurables (valeurs par defaut pour le ROSMASTER M3 PRO)
        DeclareLaunchArgument('lidar_xyz', default_value='0.0 0.0 0.10',
                              description='Position LiDAR (x y z en metres) par rapport a base_link'),
        DeclareLaunchArgument('camera_xyz', default_value='0.10 0.0 0.08',
                              description='Position camera (x y z en metres) par rapport a base_link'),
        DeclareLaunchArgument('arm_xyz', default_value='0.05 0.0 0.05',
                              description='Position base du bras (x y z en metres) par rapport a base_link'),

        # base_link -> laser_link (LiDAR)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_laser',
            arguments=[
                *LaunchConfiguration('lidar_xyz').perform(None).split() if False else ['0.0', '0.0', '0.10'],
                '0', '0', '0',          # rotation (yaw pitch roll) en rad
                'base_link', 'laser_link'
            ],
        ),

        # base_link -> camera_link (camera Astra Pro)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_camera',
            arguments=['0.10', '0.0', '0.08', '0', '0', '0', 'base_link', 'camera_link'],
        ),

        # base_link -> arm_base_link (base du bras 6 DOF)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_arm',
            arguments=['0.05', '0.0', '0.05', '0', '0', '0', 'base_link', 'arm_base_link'],
        ),
    ])

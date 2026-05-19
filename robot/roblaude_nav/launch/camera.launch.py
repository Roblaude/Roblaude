"""
camera.launch.py — Demarre la camera RGB-D Astra Pro du ROSMASTER M3 PRO

La camera est une Orbbec Astra Pro (profondeur + RGB).
Yahboom fournit le package `orbbec_camera` avec un launch file par modele.

Ce launch inclut simplement le bon launch file Orbbec + les tf2 minimales.

Usage (sur le robot, dans le conteneur ROS 2) :
    ros2 launch /path/to/camera.launch.py

Topics publies (principaux) :
    /camera/color/image_raw       : image RGB
    /camera/depth/image_raw       : carte de profondeur (16UC1, mm)
    /camera/depth/color/points    : nuage de points (sensor_msgs/PointCloud2)
"""

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare
from launch.substitutions import PathJoinSubstitution


def generate_launch_description():
    return LaunchDescription([
        # Transform statique base_link -> camera_link
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_camera',
            arguments=['0.10', '0.0', '0.08', '0', '0', '0', 'base_link', 'camera_link'],
        ),

        # Driver Orbbec Astra Pro (launch Yahboom officiel)
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('orbbec_camera'),
                    'launch',
                    'astra_pro2.launch.py'
                ])
            ])
        ),
    ])

"""
camera.launch.py — Camera RGB-D Orbbec DaBai DCW2 du ROSMASTER M3 PRO

La DaBai DCW2 (verifie dmesg : "Orbbec DaBai DCW2", 2bc5:0561 RGB + 2bc5:06a0
depth) expose ses deux flux par des chemins differents :
  - COULEUR : webcam UVC sur /dev/video0 -> node `pub_rgb_image` (Yahboom)
              publie /camera/color/image_raw.
  - DEPTH   : OrbbecSDK -> dabai_dcw2.launch.py publie /camera/depth/image_raw.

On reproduit le combo Yahboom qui marche (slam_mapping/app_camera.launch.py)
en explicite, + la TF statique base_link -> camera_link.

Usage (dans le conteneur ROS 2) :
    ros2 launch roblaude_nav camera.launch.py

Topics publies :
    /camera/color/image_raw       : image RGB (via UVC /dev/video0)
    /camera/depth/image_raw       : profondeur 16UC1 (mm)
    /camera/color/camera_info     : intrinseques reelles (lues par le detecteur)
"""

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    dabai = PathJoinSubstitution([
        FindPackageShare('orbbec_camera'), 'launch', 'dabai_dcw2.launch.py'])

    return LaunchDescription([
        # TF chassis -> camera
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_camera',
            arguments=['0.10', '0.0', '0.08', '0', '0', '0', 'base_link', 'camera_link'],
        ),

        # COULEUR : webcam UVC /dev/video0 -> /camera/color/image_raw
        Node(
            package='laserscan_to_point_publisher',
            executable='pub_rgb_image',
            name='publish_rgb_frame',
        ),

        # DEPTH : driver OrbbecSDK du modele DaBai DCW2
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([dabai]),
        ),
    ])

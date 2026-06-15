"""
camera.launch.py — Demarre la camera RGB-D du ROSMASTER M3 PRO

La camera reelle est une Orbbec DaBai DCW2 (verifie via dmesg : "Orbbec DaBai
DCW2 RGB Camera", 2bc5:0561 RGB + 2bc5:06a0 depth). On lance donc le launch
Orbbec du BON modele (dabai_dcw2), pas astra_pro2 — sinon les profils couleur ne
matchent pas et le stream couleur plante ("can not set this stream").

depth_registration:=true aligne la depth sur le repere couleur, necessaire pour
que object_detector mappe le pixel couleur vers la profondeur.

Usage (sur le robot, dans le conteneur ROS 2) :
    ros2 launch roblaude_nav camera.launch.py

Topics publies (principaux) :
    /camera/color/image_raw       : image RGB
    /camera/depth/image_raw       : carte de profondeur (16UC1, mm)
    /camera/color/camera_info     : intrinseques reelles (lues par le detecteur)
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

        # Driver Orbbec — modele DaBai DCW2 (launch officiel orbbec_camera)
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([
                PathJoinSubstitution([
                    FindPackageShare('orbbec_camera'),
                    'launch',
                    'dabai_dcw2.launch.py'
                ])
            ]),
            launch_arguments={'depth_registration': 'true'}.items(),
        ),
    ])

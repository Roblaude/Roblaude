"""
camera.launch.py — Camera RGB-D Orbbec DaBai DCW2 du ROSMASTER M3 PRO

Le driver orbbec dabai_dcw2 ouvre lui-meme les deux interfaces de la camera
(verifie dmesg : "Orbbec DaBai DCW2", 2bc5:0561 RGB UVC + 2bc5:06a0 depth) et
publie tout :
  - /camera/color/image_raw            : couleur rgb8 640x480 (UVC /dev/video0)
  - /camera/color/image_raw/compressed : JPEG (lu par le bridge MQTT -> front)
  - /camera/depth/image_raw            : profondeur 16UC1 (mm)
  - /camera/color/camera_info          : intrinseques reelles
  + sa propre TF (camera_link -> *_optical_frame).

depth_registration:=true aligne la depth sur le repere couleur (meme driver) :
les deux sortent en 640x480, donc object_detector peut indexer la depth au
pixel couleur. On ajoute juste la TF statique base_link -> camera_link.

Note : le node Yahboom `pub_rgb_image` (de app_camera) est inutile ici — il ne
fait que recompresser /camera/color/image_raw vers un topic que personne ne lit.

Usage (dans le conteneur ROS 2) :
    ros2 launch roblaude_nav camera.launch.py
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
        # TF chassis -> camera (le driver fournit ensuite camera_link -> optical)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_camera',
            arguments=['0.10', '0.0', '0.08', '0', '0', '0', 'base_link', 'camera_link'],
        ),

        # Driver OrbbecSDK DaBai DCW2 : couleur + depth alignees (registration)
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource([dabai]),
            launch_arguments={'depth_registration': 'true'}.items(),
        ),
    ])

"""
web_video.launch.py — Expose les topics image ROS2 en flux HTTP (MJPEG)

web_video_server ecoute sur le port 8080 et sert chaque topic image comme
un flux consultable dans un navigateur ou une balise <img>.

Exemples d URLs une fois lance :
  http://<ROBOT_IP>:8080/                                 -> index des topics
  http://<ROBOT_IP>:8080/stream?topic=/camera/color/image_raw&type=mjpeg
  http://<ROBOT_IP>:8080/snapshot?topic=/camera/color/image_raw

Utile pour :
  - Integrer le flux camera dans le dashboard Flask (<img src="...">)
  - Regarder la camera depuis un telephone sans installer Foxglove

Usage :
    ros2 launch /home/jetson/launch/web_video.launch.py
    ros2 launch /home/jetson/launch/web_video.launch.py port:=8081
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='8080',
        description='Port HTTP web_video_server',
    )

    address_arg = DeclareLaunchArgument(
        'address',
        default_value='0.0.0.0',
        description='Interface d ecoute (0.0.0.0 = toutes)',
    )

    return LaunchDescription([
        port_arg,
        address_arg,
        Node(
            package='web_video_server',
            executable='web_video_server',
            name='web_video_server',
            output='screen',
            parameters=[{
                'port': LaunchConfiguration('port'),
                'address': LaunchConfiguration('address'),
                'server_threads': 2,
                'ros_threads': 2,
                'default_stream_type': 'mjpeg',
                'default_transport': 'raw',
            }],
        ),
    ])

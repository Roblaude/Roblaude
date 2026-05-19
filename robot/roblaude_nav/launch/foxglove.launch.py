"""
foxglove.launch.py — Expose un pont WebSocket Foxglove Studio

foxglove_bridge ouvre un serveur WebSocket sur le port 8765. Depuis ton Mac,
Foxglove Studio se connecte en ws://<ROBOT_IP>:8765 et tu visualises en live :
  - /scan (LaserScan LiDAR)
  - /map (OccupancyGrid SLAM)
  - /camera/* (images RGB/depth)
  - /tf, /tf_static (frames)
  - /cmd_vel, /odom
  - Goals Nav2 cliquables directement sur la carte

Usage :
    ros2 launch /home/jetson/launch/foxglove.launch.py
    ros2 launch /home/jetson/launch/foxglove.launch.py port:=9090
"""

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='8765',
        description='Port WebSocket foxglove_bridge',
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
            package='foxglove_bridge',
            executable='foxglove_bridge',
            name='foxglove_bridge',
            output='screen',
            parameters=[{
                'port': LaunchConfiguration('port'),
                'address': LaunchConfiguration('address'),
                'tls': False,
                'send_buffer_limit': 10_000_000,
                'use_sim_time': False,
                'capabilities': ['clientPublish', 'parameters', 'parametersSubscribe',
                                 'services', 'connectionGraph', 'assets'],
            }],
        ),
    ])

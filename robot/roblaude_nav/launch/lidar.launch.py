"""
lidar.launch.py — Demarre le LiDAR du ROSMASTER M3 PRO

Le M3 PRO embarque un YDLidar 2D. Yahboom fournit un package qui publie
sur le topic /scan (sensor_msgs/LaserScan).

Ce launch inclut le fichier launch officiel Yahboom + les transforms tf2
minimales pour que le /scan soit exploitable.

Usage (sur le robot, dans le conteneur ROS 2) :
    ros2 launch /path/to/lidar.launch.py

Topics publies :
    /scan : sensor_msgs/LaserScan (360 deg, ~8m de portee)
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        # Transform statique base_link -> laser_link
        # (copie ici pour que ce launch soit autonome)
        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='base_to_laser',
            arguments=['0.0', '0.0', '0.10', '0', '0', '0', 'base_link', 'laser_link'],
        ),

        # Le driver LiDAR officiel Yahboom (package yahboom_M3Pro_laser)
        # Tourne sur le topic /scan
        Node(
            package='yahboom_M3Pro_laser',
            executable='ydlidar_ros2_driver_node',
            name='lidar_node',
            output='screen',
            parameters=[{
                'frame_id': 'laser_link',
                'angle_min': -3.14,
                'angle_max': 3.14,
                'range_min': 0.1,
                'range_max': 8.0,
            }]
        ),
    ])

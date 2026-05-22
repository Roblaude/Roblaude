"""
slam.launch.py — Cartographie SLAM (Simultaneous Localization And Mapping)

Utilise slam_toolbox en mode online_async. Lit /scan (LiDAR) + tf (odom)
et construit une carte 2D en temps reel sur /map.

PRE-REQUIS : lancer avant lidar.launch.py + odom.launch.py + tf2_static.launch.py

Usage :
    ros2 launch /path/to/slam.launch.py

Topics publies :
    /map (nav_msgs/OccupancyGrid)  : carte 2D (grille d'occupation)
    /slam_toolbox/graph_visualization : visualisation du graph SLAM

Pour sauvegarder la carte apres cartographie :
    ros2 run nav2_map_server map_saver_cli -f ~/maps/nom_de_la_carte

Visualiser dans RViz (depuis le bureau noVNC du robot) :
    rviz2 -d /opt/ros/humble/share/slam_toolbox/config/mapper_params_online_async.yaml
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='slam_toolbox',
            executable='async_slam_toolbox_node',
            name='slam_toolbox',
            output='screen',
            parameters=[{
                'use_sim_time': False,           # False = hardware reel
                'odom_frame': 'odom',
                'base_frame': 'base_footprint',  # PAS base_link — sinon chicken-and-egg :
                                                 # /scan_multi a frame_id=base_link, si base_frame=base_link
                                                 # slam_toolbox doit transformer base_link->map directement,
                                                 # or map n'existe pas encore -> queue full -> deadlock.
                'map_frame': 'map',
                'scan_topic': '/scan_multi',     # fusion /scan0+/scan1 par ira_laser_tools (lance par base_bringup)
                'mode': 'mapping',
                'resolution': 0.05,              # 5 cm par pixel
                'max_laser_range': 6.0,          # match config Yahboom validee (au lieu de 8.0)
                'minimum_time_interval': 0.5,    # 0.5s = ~2Hz process target, evite overrun a 7Hz scan
                'transform_publish_period': 0.02,
                'map_update_interval': 3.0,
                'scan_buffer_size': 10,          # default trop petit, on encaisse 10 scans en attente
                'transform_timeout': 0.5,        # marge pour TF cache
            }]
        ),
    ])

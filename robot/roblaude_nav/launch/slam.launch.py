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
        # scan_restamper : fix le drift +500ms des drivers LiDAR Yahboom.
        # /scan_multi (drivers + merger, stamp dans le futur) -> /scan_fixed (now()).
        # Indispensable pour que slam_toolbox puisse matcher les scans (sinon queue full
        # infinie car TF cache n'a jamais d'entree au futur).
        Node(
            package='roblaude_nav',
            executable='scan_restamper',
            name='scan_restamper',
            output='screen',
        ),
        Node(
            package='slam_toolbox',
            executable='async_slam_toolbox_node',
            name='slam_toolbox',
            output='screen',
            parameters=[{
                'use_sim_time': False,           # False = hardware reel
                'odom_frame': 'odom',
                'base_frame': 'base_footprint',  # PAS base_link — sinon chicken-and-egg avec map.
                'map_frame': 'map',
                'scan_topic': '/scan_fixed',     # restampe par scan_restamper (cf node au-dessus)
                'mode': 'mapping',
                'resolution': 0.05,              # 5 cm par pixel
                'min_laser_range': 0.3,          # ignore < 30cm : le bras M3 Pro retombe devant le LiDAR
                                                 # et est detecte comme obstacle fictif (vu IRL 22 mai).
                'max_laser_range': 4.0,          # capacite reelle merger Yahboom (warning slam si plus)
                'minimum_time_interval': 0.5,
                # 20 Hz suffit pour Nav2/visualisation et libere le Nano.
                # 50 Hz surchargeait mqtt_bridge/TF pendant l'automap.
                'transform_publish_period': 0.05,
                'map_update_interval': 3.0,
                'scan_buffer_size': 10,
                'transform_timeout': 0.5,
            }]
        ),
    ])

"""explore.launch.py — exploration auto bout en bout.

Orchestre SLAM + Nav2 + rotation initiale + explore_lite dans le bon ordre :
  1. slam_toolbox demarre (cree /map a partir de /scan_multi)
  2. Nav2 demarre (planificateur de chemin pour atteindre les frontieres)
  3. initial_rotation tourne 360° sur place (casse le chicken-and-egg —
     SLAM accumule un voisinage exploitable autour du robot)
  4. explore_lite detecte les frontieres et envoie des goals Nav2

A lancer :
    ros2 launch roblaude_nav explore.launch.py

Pour la demo, on peut aussi le lancer apres avoir pousse manuellement le
robot de 50 cm — l'initial_rotation reste utile comme amorcage 360°.
"""
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, TimerAction, ExecuteProcess
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
import os


def generate_launch_description():
    roblaude_nav_share = get_package_share_directory('roblaude_nav')
    slam_launch = os.path.join(roblaude_nav_share, 'launch', 'slam.launch.py')
    nav2_launch = os.path.join(roblaude_nav_share, 'launch', 'nav2.launch.py')

    return LaunchDescription([
        # 1. SLAM tout de suite — il faut /map avant tout le reste
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(slam_launch)
        ),

        # 2. Nav2 apres 4s — laisse SLAM s'initialiser
        TimerAction(
            period=4.0,
            actions=[IncludeLaunchDescription(
                PythonLaunchDescriptionSource(nav2_launch)
            )],
        ),

        # 3. Rotation initiale apres 10s — Nav2 doit etre actif
        # pour qu'explore_lite (lance ensuite) puisse envoyer des goals
        TimerAction(
            period=10.0,
            actions=[Node(
                package='roblaude_nav',
                executable='initial_rotation',
                name='initial_rotation',
                output='screen',
            )],
        ),

        # 4. explore_lite — frontier_size petit pour qu'il trouve des
        # frontieres meme avec une carte minuscule au demarrage. Plus on
        # baisse, plus il explore. 0.3m = environ 6 pixels a 5cm/px.
        TimerAction(
            period=35.0,
            actions=[Node(
                package='explore_lite',
                executable='explore',
                name='explore_node',
                output='screen',
                parameters=[{
                    'robot_base_frame': 'base_link',
                    'costmap_topic': 'map',
                    'costmap_updates_topic': 'map_updates',
                    'visualize': True,
                    'planner_frequency': 0.33,
                    'progress_timeout': 30.0,
                    'potential_scale': 3.0,
                    'orientation_scale': 0.0,
                    'gain_scale': 1.0,
                    'transform_tolerance': 0.3,
                    'min_frontier_size': 0.3,   # tres permissif pour amorcer
                }],
            )],
        ),
    ])

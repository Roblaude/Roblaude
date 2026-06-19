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
    # IMPORTANT : on prend le Nav2 CORRIGE (nav2_slam_roblaude), pas nav2.launch.py.
    # Le vanilla partait en ABORTED (general_goal_checker Humble + tolerance trop
    # serree). Le corrige planifie correctement -> explore_lite peut envoyer des goals.
    nav2_launch = os.path.join(roblaude_nav_share, 'launch', 'nav2_slam_roblaude.launch.py')

    return LaunchDescription([
        # 1. SLAM tout de suite — il faut /map avant tout le reste
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(slam_launch)
        ),

        # 2. Nav2 corrige apres 5s — laisse SLAM s'initialiser (map->odom)
        TimerAction(
            period=5.0,
            actions=[IncludeLaunchDescription(
                PythonLaunchDescriptionSource(nav2_launch)
            )],
        ),

        # 3. Rotation initiale apres 12s — Nav2 doit etre actif
        # pour qu'explore_lite (lance ensuite) puisse envoyer des goals
        TimerAction(
            period=12.0,
            actions=[Node(
                package='roblaude_nav',
                executable='initial_rotation',
                name='initial_rotation',
                output='screen',
            )],
        ),

        # 4. explore_lite — demarre a 60s : laisse SLAM publier map->odom de facon
        # STABLE avant qu'explore lise la pose (sinon extrapolation error au boot).
        # Rythme reduit ~25% pour eviter les preemptions sur le Nano.
        TimerAction(
            period=60.0,
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
                    'planner_frequency': 0.25,
                    'progress_timeout': 40.0,
                    'potential_scale': 3.0,
                    'orientation_scale': 0.0,
                    'gain_scale': 1.0,
                    'transform_tolerance': 3.0,   # SLAM lag au demarrage -> 0.5 trop court (extrapolation error)
                    'min_frontier_size': 0.4,
                }],
            )],
        ),
    ])

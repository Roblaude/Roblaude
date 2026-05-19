"""
teleop.launch.py — Teleoperation clavier du ROSMASTER M3 PRO

Utilise le node yahboom_keyboard fourni par Yahboom qui publie /cmd_vel
selon les touches du clavier (i/,/j/l/u/o pour bouger, k pour stop).

Usage (necessite un terminal interactif, donc pas ideal via dashboard) :
    ros2 launch /path/to/teleop.launch.py

Touches :
    i : avance           , : recule          k : stop
    j : rotation gauche  l : rotation droite
    u/o : diagonales avant     m/. : diagonales arriere
    q/z : +/- vitesse max 10%
"""

from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='yahboomcar_ctrl',
            executable='yahboom_keyboard',
            name='teleop_keyboard',
            output='screen',
            prefix='xterm -e',  # ouvre dans un terminal pour capter les touches
        ),
    ])

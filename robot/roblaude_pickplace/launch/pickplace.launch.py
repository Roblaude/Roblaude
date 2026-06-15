"""pickplace.launch.py — lance le detecteur d'objet (UC-02).

Ne lance QUE object_detector (+ ses params). La camera Orbbec est lancee a part
par roblaude_nav/camera.launch.py — on evite ainsi une dependance croisee entre
les deux packages. L'autostart du container lance les deux (decision C : camera
+ detecteur toujours ON).

    ros2 launch roblaude_pickplace pickplace.launch.py
"""
from launch import LaunchDescription
from launch.substitutions import PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    params = PathJoinSubstitution([
        FindPackageShare('roblaude_pickplace'), 'config', 'detection_params.yaml'])

    return LaunchDescription([
        Node(
            package='roblaude_pickplace',
            executable='object_detector',
            name='object_detector',
            parameters=[params],
            output='screen',
        ),
    ])

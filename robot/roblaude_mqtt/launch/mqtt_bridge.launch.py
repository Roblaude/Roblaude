"""Lance le pont MQTT <-> ROS 2.

Usage :
    ros2 launch roblaude_mqtt mqtt_bridge.launch.py
    ros2 launch roblaude_mqtt mqtt_bridge.launch.py broker_host:=10.0.0.5 robot_id:=2
"""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue


def generate_launch_description():
    config = os.path.join(
        get_package_share_directory('roblaude_mqtt'),
        'config', 'mqtt_bridge.yaml',
    )

    # Arguments surchargeables en ligne de commande.
    args = [
        DeclareLaunchArgument('broker_host', default_value='localhost'),
        DeclareLaunchArgument('broker_port', default_value='1883'),
        DeclareLaunchArgument('robot_id', default_value='1'),
    ]

    bridge = Node(
        package='roblaude_mqtt',
        executable='mqtt_bridge',
        name='mqtt_bridge',
        output='screen',
        parameters=[
            config,  # valeurs par defaut depuis le yaml
            {
                # ParameterValue force le type : sinon les args CLI arrivent en
                # string et ne matchent pas les params int declares dans le noeud
                'broker_host': ParameterValue(
                    LaunchConfiguration('broker_host'), value_type=str),
                'broker_port': ParameterValue(
                    LaunchConfiguration('broker_port'), value_type=int),
                'robot_id': ParameterValue(
                    LaunchConfiguration('robot_id'), value_type=int),
            },
        ],
    )

    return LaunchDescription([*args, bridge])

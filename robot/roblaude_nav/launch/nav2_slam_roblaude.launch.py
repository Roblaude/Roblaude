"""Nav2 pour replay autonome sur carte SLAM live RobLaude.

Part des params Nav2 Humble installes dans le container, applique les
corrections RobLaude (cf roblaude_nav/nav2_overrides.py), puis lance
navigation_launch.py (pas de map_server/amcl : slam_toolbox fournit /map + TF).

Usage apres base_bringup + slam.launch.py :
  ros2 launch roblaude_nav nav2_slam_roblaude.launch.py

Le fichier de params peut etre surcharge :
  ROBLAUDE_NAV2_PARAMS=/chemin/vers/nav2_params.yaml ros2 launch ...
"""

import os
import tempfile

import yaml

from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, OpaqueFunction
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare

from roblaude_nav.nav2_overrides import apply_overrides


DEFAULT_NAV2_PARAMS = os.environ.get(
    'ROBLAUDE_NAV2_PARAMS',
    '/opt/ros/humble/share/nav2_bringup/params/nav2_params.yaml',
)


def _patch_nav2_params(context, *_args, **_kwargs):
    if not os.path.isfile(DEFAULT_NAV2_PARAMS):
        raise FileNotFoundError(
            f'nav2_params.yaml introuvable : {DEFAULT_NAV2_PARAMS}. '
            'Lance dans le container m3pro (ROS Humble) ou exporte ROBLAUDE_NAV2_PARAMS.'
        )

    with open(DEFAULT_NAV2_PARAMS, 'r', encoding='utf-8') as f:
        params = yaml.safe_load(f)

    apply_overrides(params)

    fd, path = tempfile.mkstemp(prefix='roblaude_nav2_slam_', suffix='.yaml')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        yaml.safe_dump(params, f, sort_keys=False)

    include = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('nav2_bringup'),
                'launch',
                'navigation_launch.py',
            ])
        ]),
        launch_arguments={
            'use_sim_time': 'false',
            'params_file': path,
        }.items(),
    )
    return [include]


def generate_launch_description():
    return LaunchDescription([
        OpaqueFunction(function=_patch_nav2_params),
    ])

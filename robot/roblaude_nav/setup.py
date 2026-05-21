import os
from glob import glob
from setuptools import setup

package_name = 'roblaude_nav'

setup(
    name=package_name,
    version='0.1.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'),
            glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'config'),
            glob('config/*')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Wissem',
    maintainer_email='wissemkarboub@gmail.com',
    description='Navigation autonome RobLaude — SLAM + Nav2 pour le ROSMASTER M3 PRO',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'scan_restamper = roblaude_nav.scan_restamper:main',
            'odom_to_tf = roblaude_nav.odom_to_tf:main',
            'mission_executor = roblaude_nav.mission_executor:main',
        ],
    },
)

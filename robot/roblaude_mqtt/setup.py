import os
from glob import glob
from setuptools import setup

package_name = 'roblaude_mqtt'

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
    install_requires=['setuptools', 'paho-mqtt~=1.6'],
    zip_safe=True,
    maintainer='Wissem',
    maintainer_email='[email protected]',
    description='Pont MQTT <-> ROS 2 pour RobLaude — contrat docs/mqtt-spec.md',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'mqtt_bridge = roblaude_mqtt.mqtt_bridge:main',
        ],
    },
)

import os
from glob import glob
from setuptools import setup

package_name = 'roblaude_pickplace'

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
    description='Pick and place RobLaude (UC-02) — detection couleur + IK bras M3 PRO',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'object_detector = roblaude_pickplace.object_detector:main',
        ],
    },
)

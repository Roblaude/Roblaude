#!/usr/bin/env python3
"""initial_rotation — fait tourner le robot 360° au demarrage pour amorcer SLAM.

Le chicken-and-egg de l'exploration auto : explore_lite ne trouve pas de
frontiere quand la carte est trop petite (robot stationnaire). En faisant
tourner le robot sur lui-meme, on permet a SLAM d'accumuler des scans depuis
le meme point sous tous les angles -> /map plus precise -> explore_lite voit
des frontieres -> auto-exploration peut demarrer.

Publie sur /cmd_vel une rotation a 0.3 rad/s pendant ~22 s (= 2*pi/0.3).
Puis envoie Twist zero et exit. A lancer UNE FOIS au demarrage de la stack
exploration (cf. roblaude_nav/launch/explore.launch.py).
"""
import math
import time

import rclpy
from geometry_msgs.msg import Twist
from rclpy.node import Node


# Vitesse de rotation moderee — laisse a SLAM le temps d'integrer chaque scan
ANGULAR_SPEED_RAD_S = 0.4
ROTATION_DURATION_S = 2 * math.pi / ANGULAR_SPEED_RAD_S + 1.0  # 360° + marge


class InitialRotation(Node):
    def __init__(self):
        super().__init__('initial_rotation')
        self.cmd_vel = self.create_publisher(Twist, '/cmd_vel', 10)
        self.get_logger().info(
            f'rotation initiale {ANGULAR_SPEED_RAD_S} rad/s pendant '
            f'{ROTATION_DURATION_S:.1f}s — amorce SLAM')

    def run(self):
        # Laisse le temps au publisher d'etre detecte par les subscribers (cmd_vel
        # est souvent mappe au driver moteur). Sinon premiers messages perdus.
        time.sleep(1.0)

        twist = Twist()
        twist.angular.z = ANGULAR_SPEED_RAD_S
        deadline = time.monotonic() + ROTATION_DURATION_S
        while time.monotonic() < deadline and rclpy.ok():
            self.cmd_vel.publish(twist)
            time.sleep(0.1)  # 10 Hz suffisant pour un cmd_vel

        # Stop net
        twist = Twist()
        for _ in range(5):
            self.cmd_vel.publish(twist)
            time.sleep(0.05)
        self.get_logger().info('rotation initiale terminee')


def main(args=None):
    rclpy.init(args=args)
    node = InitialRotation()
    try:
        node.run()
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()

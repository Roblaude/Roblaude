#!/usr/bin/env python3
"""
scan_restamper.py - Re-stamp les messages du STM32 au temps courant

Probleme : le STM32 publie /scan0 /scan1 /odom_raw avec timestamps dates
de decembre 2025 (horloge STM32 pas synchronisee avec le Jetson). SLAM
rejette ces messages car l ecart avec les TF courants depasse sa tolerance.

Ce noeud :
  - Ecoute /scan (laser fusionne)      -> republie /scan_stamped avec now()
  - Ecoute /odom_raw (odometrie STM32) -> republie /odom avec now()
                                        + publie TF odom -> base_link avec now()

Resultat : SLAM tourne sur /scan_stamped et trouve toujours un TF coherent.

Usage :
    export ROS_DOMAIN_ID=30
    python3 /root/scan_restamper.py
"""

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from nav_msgs.msg import Odometry
from geometry_msgs.msg import TransformStamped
from tf2_ros import TransformBroadcaster


class ScanRestamper(Node):
    def __init__(self):
        super().__init__('scan_restamper')

        self.br = TransformBroadcaster(self)
        self.scan_pub = self.create_publisher(LaserScan, '/scan_stamped', 10)
        self.odom_pub = self.create_publisher(Odometry, '/odom', 10)

        self.create_subscription(LaserScan, '/scan', self.scan_cb, 10)
        self.create_subscription(Odometry, '/odom_raw', self.odom_cb, 10)

        self._scan_count = 0
        self._odom_count = 0
        self.create_timer(5.0, self._report)
        self.get_logger().info(
            'scan_restamper ready : /scan -> /scan_stamped, /odom_raw -> /odom + TF'
        )

    def scan_cb(self, msg: LaserScan):
        msg.header.stamp = self.get_clock().now().to_msg()
        self.scan_pub.publish(msg)
        self._scan_count += 1

    def odom_cb(self, msg: Odometry):
        now = self.get_clock().now().to_msg()

        t = TransformStamped()
        t.header.stamp = now
        t.header.frame_id = 'odom'
        t.child_frame_id = 'base_link'
        p = msg.pose.pose.position
        q = msg.pose.pose.orientation
        t.transform.translation.x = p.x
        t.transform.translation.y = p.y
        t.transform.translation.z = p.z
        t.transform.rotation = q
        self.br.sendTransform(t)

        out = Odometry()
        out.header.stamp = now
        out.header.frame_id = 'odom'
        out.child_frame_id = 'base_link'
        out.pose = msg.pose
        out.twist = msg.twist
        self.odom_pub.publish(out)
        self._odom_count += 1

    def _report(self):
        self.get_logger().info(
            f'Restamped: {self._scan_count} scans, {self._odom_count} odom'
        )
        self._scan_count = 0
        self._odom_count = 0


def main():
    rclpy.init()
    node = ScanRestamper()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

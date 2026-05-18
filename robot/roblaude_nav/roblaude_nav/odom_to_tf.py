#!/usr/bin/env python3
"""
odom_to_tf.py - Convertit /odom_raw en TF odom -> base_link + republie sur /odom

Le STM32 du ROSMASTER M3 PRO publie la nav_msgs/Odometry sur /odom_raw mais
ne publie pas le transform odom -> base_link correspondant. Sans ce TF,
SLAM ne peut pas estimer la position du robot.

Ce noeud :
  - Abonnement : /odom_raw (nav_msgs/Odometry)
  - Publications :
      * TF dynamique odom -> base_link
      * /odom (nav_msgs/Odometry, header.frame_id force a 'odom')

Usage (dans le container ROS2) :
    export ROS_DOMAIN_ID=30
    python3 /root/odom_to_tf.py
"""

import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
from geometry_msgs.msg import TransformStamped
from tf2_ros import TransformBroadcaster


class OdomToTf(Node):
    def __init__(self):
        super().__init__('odom_to_tf')
        self.br = TransformBroadcaster(self)
        self.pub = self.create_publisher(Odometry, '/odom', 10)
        self.sub = self.create_subscription(
            Odometry, '/odom_raw', self.cb, 10
        )
        self.get_logger().info('odom_to_tf ready : /odom_raw -> TF + /odom')

    def cb(self, msg: Odometry):
        t = TransformStamped()
        t.header.stamp = msg.header.stamp
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
        out.header.stamp = msg.header.stamp
        out.header.frame_id = 'odom'
        out.child_frame_id = 'base_link'
        out.pose = msg.pose
        out.twist = msg.twist
        self.pub.publish(out)


def main():
    rclpy.init()
    node = OdomToTf()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

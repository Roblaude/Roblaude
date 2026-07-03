#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from rclpy.duration import Duration
from sensor_msgs.msg import LaserScan
from rclpy.qos import QoSProfile, ReliabilityPolicy


class ScanRestamper(Node):
    def __init__(self):
        super().__init__('scan_restamper')

        # recul du stamp pour rester derriere la derniere TF odom dispo.
        # ajustable a chaud sans rebuild : -p stamp_offset:=0.15
        self.declare_parameter('stamp_offset', 0.2)
        self._offset = Duration(seconds=self.get_parameter('stamp_offset').value)

        qos = QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE)
        self.pub = self.create_publisher(LaserScan, '/scan_fixed', qos)
        self.sub = self.create_subscription(LaserScan, '/scan_multi', self.on_scan, qos)

        self._count = 0
        self.create_timer(5.0, self._report)
        self.get_logger().info(
            f'scan_restamper ready : /scan_multi -> /scan_fixed '
            f'(stamps -> now - {self.get_parameter("stamp_offset").value}s)'
        )

    def on_scan(self, msg: LaserScan):
        msg.header.stamp = (self.get_clock().now() - self._offset).to_msg()
        self.pub.publish(msg)
        self._count += 1

    def _report(self):
        self.get_logger().info(f'restamped {self._count} scans')
        self._count = 0


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

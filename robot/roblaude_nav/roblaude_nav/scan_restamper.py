#!/usr/bin/env python3
"""
scan_restamper.py - Re-stamp /scan_multi au temps courant pour slam_toolbox.

Probleme racine identifie le 22 mai 2026 :
  Les drivers LiDAR Yahboom (YDLidar X2L sur /scan0 et /scan1) publient avec
  un timestamp ~500ms DANS LE FUTUR (drift constant +470 a +580ms mesure).
  Le merger laserscan_multi_merger propage ce drift sur /scan_multi.

Impact sur slam_toolbox :
  Le message_filter interne attend une TF base_footprint->map au temps du
  scan stamp. Si stamp = now+500ms, la TF cache (publiee en wall time) n'a
  jamais d'entree dans le futur -> filter garde le scan en queue -> queue
  deborde -> drop infini -> aucun scan jamais matche -> pas de TF map->odom
  -> Nav2 ne peut pas planifier -> robot immobile.

Solution :
  Souscrire a /scan_multi, copier le message, ecraser msg.header.stamp avec
  un temps wall LEGEREMENT dans le passe (now - stamp_offset), republier sur
  /scan_fixed. Slam_toolbox abonne a /scan_fixed -> trouve la TF dans le cache
  -> match -> publie TF map->odom -> debloque toute la stack.

  Pourquoi pas now() pile : la TF odom->base_footprint (EKF Yahboom) arrive
  avec un petit retard. Si on stampe le scan a now(), la TF a cet instant
  n'est pas encore publiee -> le scan attend dans la queue du message_filter
  -> queue full -> drop (vu IRL meme robot a l'arret). On recule le stamp de
  ~0.2s pour tomber sur une pose odom deja dispo. Biais negligeable a vitesse
  d'exploration (~2-4cm a 5cm/px).

Note : on ne touche PAS a l'odom ni a la TF. L'ekf_filter_node (lance par
base_bringup Yahboom) publie deja /odom et TF odom->base_link avec stamps
corrects, pas de drift cote EKF.
"""

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

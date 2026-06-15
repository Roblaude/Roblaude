#!/usr/bin/env python3
"""object_detector — detection d'objet par couleur (HSV + depth Orbbec).

Porte de la stack vision du prof, recale sur notre materiel et nos canaux :
  - camera Orbbec Astra Pro (pas RealSense) : topics et frame optique reels,
  - intrinseques lues sur /camera/color/camera_info (plus de fx=615 en dur),
  - couleur cible = hex (def via parametre, surchargeable a chaud par mission
    sur /roblaude/target_color) -> plage HSV derivee (cf. color.py),
  - sortie sur NOTRE canal /roblaude/detections (PoseArray), jamais MQTT.

Le node n'actionne rien : il observe et publie des positions. C'est
mission_executor (seul proprietaire du bras) qui consomme ces detections.

    ros2 run roblaude_pickplace object_detector
"""
import numpy as np
import rclpy
from rclpy.node import Node

import cv2
from geometry_msgs.msg import Pose, PoseArray
from sensor_msgs.msg import CameraInfo, Image
from std_msgs.msg import String

from roblaude_pickplace.color import hex_to_hsv_ranges
from roblaude_pickplace.detection import backproject, sample_depth_median


def decode_image(msg: Image):
    """ROS Image -> numpy. Couleur en RGB, depth en niveaux bruts."""
    h, w = msg.height, msg.width
    enc = msg.encoding.lower()
    data = bytes(msg.data)
    if enc == 'rgb8':
        return np.frombuffer(data, dtype=np.uint8).reshape(h, w, 3)
    if enc == 'bgr8':
        arr = np.frombuffer(data, dtype=np.uint8).reshape(h, w, 3)
        return cv2.cvtColor(arr, cv2.COLOR_BGR2RGB)
    if enc in ('16uc1', 'mono16'):
        return np.frombuffer(data, dtype=np.uint16).reshape(h, w)
    if enc in ('32fc1',):
        return np.frombuffer(data, dtype=np.float32).reshape(h, w)
    if enc in ('mono8', '8uc1'):
        return np.frombuffer(data, dtype=np.uint8).reshape(h, w)
    return None


class ObjectDetector(Node):
    def __init__(self):
        super().__init__('object_detector')

        # --- Topics Orbbec (parametrables) ---
        self.color_topic = self.declare_parameter(
            'color_topic', '/camera/color/image_raw').value
        self.depth_topic = self.declare_parameter(
            'depth_topic', '/camera/depth/image_raw').value
        self.info_topic = self.declare_parameter(
            'camera_info_topic', '/camera/color/camera_info').value

        # --- Couleur cible + tolerances HSV ---
        self.target_color = self.declare_parameter('target_color', '#ff0000').value
        self.h_tol = int(self.declare_parameter('h_tol', 10).value)
        self.s_min = int(self.declare_parameter('s_min', 120).value)
        self.v_min = int(self.declare_parameter('v_min', 70).value)
        self.hsv_ranges = hex_to_hsv_ranges(
            self.target_color, self.h_tol, self.s_min, self.v_min)

        # --- Seuils detection ---
        self.min_area = int(self.declare_parameter('min_contour_area', 500).value)
        self.max_depth = float(self.declare_parameter('max_detection_depth', 1.0).value)
        self.min_depth = float(self.declare_parameter('min_detection_depth', 0.15).value)
        self.depth_scale = float(self.declare_parameter('depth_scale', 0.001).value)

        # --- Intrinseques : valeurs de repli, ecrasees par camera_info ---
        self.fx = float(self.declare_parameter('camera_fx', 600.0).value)
        self.fy = float(self.declare_parameter('camera_fy', 600.0).value)
        self.cx = float(self.declare_parameter('camera_cx', 320.0).value)
        self.cy = float(self.declare_parameter('camera_cy', 240.0).value)
        self.have_info = False

        self.latest_color = None
        self.latest_depth = None

        self.create_subscription(Image, self.color_topic, self._on_color, 5)
        self.create_subscription(Image, self.depth_topic, self._on_depth, 5)
        self.create_subscription(CameraInfo, self.info_topic, self._on_info, 5)
        # la mission peut imposer une couleur a chaud (hex)
        self.create_subscription(String, '/roblaude/target_color', self._on_color_cmd, 5)

        self.pose_pub = self.create_publisher(PoseArray, '/roblaude/detections', 10)
        # image annotee pour le reglage HSV en vrai
        self.image_pub = self.create_publisher(Image, '/roblaude/detection_image', 5)

        self.create_timer(0.1, self._detect)  # 10 Hz
        self.get_logger().info(
            f'object_detector pret — couleur {self.target_color}, '
            f'color={self.color_topic} depth={self.depth_topic}')

    # ---------- callbacks entree ----------

    def _on_color(self, msg):
        self.latest_color = msg

    def _on_depth(self, msg):
        self.latest_depth = msg

    def _on_info(self, msg):
        # intrinseques reelles de l'Orbbec (matrice K : fx 0 cx / 0 fy cy / 0 0 1)
        self.fx, self.fy = msg.k[0], msg.k[4]
        self.cx, self.cy = msg.k[2], msg.k[5]
        if not self.have_info:
            self.have_info = True
            self.get_logger().info(
                f'intrinseques camera_info : fx={self.fx:.1f} fy={self.fy:.1f} '
                f'cx={self.cx:.1f} cy={self.cy:.1f}')

    def _on_color_cmd(self, msg):
        try:
            ranges = hex_to_hsv_ranges(msg.data, self.h_tol, self.s_min, self.v_min)
        except ValueError as e:
            self.get_logger().warn(f'target_color rejete : {e}')
            return
        self.target_color = msg.data
        self.hsv_ranges = ranges
        self.get_logger().info(f'couleur cible -> {msg.data}')

    # ---------- detection ----------

    def _detect(self):
        if self.latest_color is None:
            return
        color_img = decode_image(self.latest_color)
        if color_img is None or color_img.ndim != 3:
            return
        hsv = cv2.cvtColor(color_img, cv2.COLOR_RGB2HSV)

        # masque a partir des plages HSV derivees du hex (gere le wrap rouge)
        mask = None
        for low, high in self.hsv_ranges:
            m = cv2.inRange(hsv, np.array(low, np.uint8), np.array(high, np.uint8))
            mask = m if mask is None else cv2.bitwise_or(mask, m)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        depth_img = decode_image(self.latest_depth) if self.latest_depth else None

        detections = []  # (x3d, y3d, z, cx, cy, r)
        for c in contours:
            if cv2.contourArea(c) < self.min_area:
                continue
            (px, py), radius = cv2.minEnclosingCircle(c)
            px, py = int(px), int(py)
            z = sample_depth_median(depth_img, px, py, radius,
                                    self.depth_scale, self.min_depth, self.max_depth)
            x3d, y3d, z3d = backproject(px, py, z, self.fx, self.fy, self.cx, self.cy)
            detections.append((x3d, y3d, z3d, px, py, int(radius)))

        self._publish_poses(detections)
        self._publish_annotated(color_img, detections)

    def _publish_poses(self, detections):
        pa = PoseArray()
        pa.header.stamp = self.get_clock().now().to_msg()
        # frame = celui publie par la camera (repere optique Orbbec reel)
        pa.header.frame_id = self.latest_color.header.frame_id or 'camera_color_optical_frame'
        for x, y, z, _, _, _ in detections:
            p = Pose()
            p.position.x, p.position.y, p.position.z = x, y, z
            p.orientation.w = 1.0
            pa.poses.append(p)
        self.pose_pub.publish(pa)

    def _publish_annotated(self, color_img, detections):
        if self.image_pub.get_subscription_count() == 0:
            return  # personne ne regarde, on epargne la bande passante
        annotated = color_img.copy()
        for x, y, z, px, py, r in detections:
            col = (0, 255, 0) if z > 0 else (255, 255, 0)
            cv2.circle(annotated, (px, py), r, col, 2)
            label = f'{z:.2f}m' if z > 0 else 'no depth'
            cv2.putText(annotated, label, (px - 30, py - r - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2)
        out = Image()
        out.header = self.latest_color.header
        out.height, out.width = annotated.shape[:2]
        out.encoding = 'rgb8'
        out.step = out.width * 3
        out.data = annotated.tobytes()
        self.image_pub.publish(out)


def main(args=None):
    rclpy.init(args=args)
    node = ObjectDetector()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()

"""
Verifie la conversion OccupancyGrid -> PNG (mode L niveaux de gris)
selon la convention SLAM : -1 unknown -> 205 gris, 0 free -> 254 blanc,
100 occupied -> 0 noir. Y-flip car PIL origin = top-left, SLAM = bottom-left.
"""
import io
from PIL import Image


def test_occupancy_to_png_basic():
    # Stubs des modules ROS pour permettre l'import (mqtt_bridge depend de rclpy/std_msgs/etc.)
    from unittest.mock import MagicMock, patch
    with patch.dict('sys.modules', {
        'rclpy': MagicMock(), 'rclpy.node': MagicMock(),
        'rclpy.time': MagicMock(), 'rclpy.duration': MagicMock(),
        'std_msgs.msg': MagicMock(), 'nav_msgs.msg': MagicMock(),
        'sensor_msgs.msg': MagicMock(), 'geometry_msgs.msg': MagicMock(),
        'visualization_msgs.msg': MagicMock(), 'tf2_ros': MagicMock(),
        'paho': MagicMock(), 'paho.mqtt': MagicMock(), 'paho.mqtt.client': MagicMock(),
    }):
        from roblaude_mqtt.mqtt_bridge import occupancy_to_png

        # Grid 2x2 : layout row-major SLAM (bottom row d'abord)
        #   y=0 (bottom) : -1, 0    (unknown, free)
        #   y=1 (top)    : 100, 0   (occupied, free)
        width, height = 2, 2
        data = [-1, 0, 100, 0]

        png_bytes = occupancy_to_png(width, height, data)
        assert png_bytes[:8] == b'\x89PNG\r\n\x1a\n'

        img = Image.open(io.BytesIO(png_bytes))
        assert img.mode == 'L'
        assert img.size == (width, height)

        # Apres flip Y :
        #   top row (row 0) du PNG = y=1 SLAM = [100, 0] -> [0, 254]
        #   bottom row (row 1) du PNG = y=0 SLAM = [-1, 0] -> [205, 254]
        pixels = list(img.getdata())
        assert pixels == [0, 254, 205, 254]


def test_occupancy_threshold_50():
    from unittest.mock import MagicMock, patch
    with patch.dict('sys.modules', {
        'rclpy': MagicMock(), 'rclpy.node': MagicMock(),
        'rclpy.time': MagicMock(), 'rclpy.duration': MagicMock(),
        'std_msgs.msg': MagicMock(), 'nav_msgs.msg': MagicMock(),
        'sensor_msgs.msg': MagicMock(), 'geometry_msgs.msg': MagicMock(),
        'visualization_msgs.msg': MagicMock(), 'tf2_ros': MagicMock(),
        'paho': MagicMock(), 'paho.mqtt': MagicMock(), 'paho.mqtt.client': MagicMock(),
    }):
        from roblaude_mqtt.mqtt_bridge import occupancy_to_png

        # value=49 -> free (254), value=50 -> occupied (0), value=99 -> occupied
        img = Image.open(io.BytesIO(occupancy_to_png(3, 1, [49, 50, 99])))
        assert list(img.getdata()) == [254, 0, 0]

"""
Le dead-man timer doit publier Twist(0,0) sur /cmd_vel si pas de cmd/teleop
recu pendant 500ms. Evite le runaway si l'onglet web se ferme brutalement.
"""
import time
from unittest.mock import MagicMock, patch


def _load_bridge():
    with patch.dict('sys.modules', {
        'rclpy': MagicMock(), 'rclpy.node': MagicMock(),
        'std_msgs.msg': MagicMock(), 'nav_msgs.msg': MagicMock(),
        'sensor_msgs.msg': MagicMock(), 'geometry_msgs.msg': MagicMock(),
        'visualization_msgs.msg': MagicMock(), 'tf2_msgs.msg': MagicMock(),
        'paho': MagicMock(), 'paho.mqtt': MagicMock(), 'paho.mqtt.client': MagicMock(),
    }):
        from roblaude_mqtt.mqtt_bridge import TeleopDeadman
        return TeleopDeadman


def test_deadman_publishes_zero_after_timeout():
    TeleopDeadman = _load_bridge()
    publish_mock = MagicMock()
    deadman = TeleopDeadman(publish_zero=publish_mock, timeout_s=0.1)

    deadman.feed(lin=0.3, ang=0.0)
    time.sleep(0.05)
    assert publish_mock.call_count == 0  # pas encore expire

    time.sleep(0.15)  # 0.05 + 0.15 = 0.2s > 0.1s timeout
    assert publish_mock.call_count >= 1

    deadman.stop()


def test_deadman_resets_on_feed():
    TeleopDeadman = _load_bridge()
    publish_mock = MagicMock()
    deadman = TeleopDeadman(publish_zero=publish_mock, timeout_s=0.1)

    for _ in range(5):
        deadman.feed(lin=0.1, ang=0.0)
        time.sleep(0.05)
    # 5x 50ms = 250ms total, mais a chaque feed le timer est reset -> jamais expire
    assert publish_mock.call_count == 0

    time.sleep(0.15)
    assert publish_mock.call_count >= 1
    deadman.stop()

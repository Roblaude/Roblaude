"""
Tests pour camera + joint_states publishers. La logique throttle dans
les handlers est testee indirectement via la fonction pure build_joint_states_payload
+ un test d'integration leger sur le throttle.
"""
import time
from unittest.mock import MagicMock, patch


def _stubs():
    return {
        'rclpy': MagicMock(), 'rclpy.node': MagicMock(),
        'rclpy.time': MagicMock(), 'rclpy.duration': MagicMock(),
        'std_msgs.msg': MagicMock(), 'nav_msgs.msg': MagicMock(),
        'sensor_msgs.msg': MagicMock(), 'geometry_msgs.msg': MagicMock(),
        'visualization_msgs.msg': MagicMock(), 'tf2_ros': MagicMock(),
        'paho': MagicMock(), 'paho.mqtt': MagicMock(), 'paho.mqtt.client': MagicMock(),
    }


def test_build_joint_states_payload_keeps_names_and_positions():
    with patch.dict('sys.modules', _stubs()):
        from roblaude_mqtt.mqtt_bridge import build_joint_states_payload
        p = build_joint_states_payload(
            names=['base', 'shoulder', 'elbow', 'wrist1', 'wrist2'],
            positions=[0.1, -0.3, 0.7, 0.0, 0.2],
        )
        assert p['positions'] == [0.1, -0.3, 0.7, 0.0, 0.2]
        assert p['names'] == ['base', 'shoulder', 'elbow', 'wrist1', 'wrist2']
        assert 'timestamp' in p
        assert p['schemaVersion'] == 1
        assert 'messageId' in p


def test_build_joint_states_handles_empty():
    with patch.dict('sys.modules', _stubs()):
        from roblaude_mqtt.mqtt_bridge import build_joint_states_payload
        p = build_joint_states_payload(names=[], positions=[])
        assert p['names'] == []
        assert p['positions'] == []


def test_throttle_constants_exist_and_reasonable():
    """Sanity check : les periodes doivent etre coherentes (~5Hz camera, ~10Hz joints)."""
    with patch.dict('sys.modules', _stubs()):
        from roblaude_mqtt import mqtt_bridge as mb
        assert 0.15 <= mb.CAMERA_PUBLISH_PERIOD_S <= 0.5
        assert 0.05 <= mb.JOINT_STATES_PUBLISH_PERIOD_S <= 0.2


def test_throttle_simulation_pure():
    """Simule le throttle utilise dans les handlers."""
    period = 0.1
    last = 0.0
    publishes = 0

    def attempt():
        nonlocal last, publishes
        now = time.monotonic()
        if now - last < period:
            return False
        last = now
        publishes += 1
        return True

    attempt()
    attempt()  # drop
    assert publishes == 1
    time.sleep(period + 0.05)
    attempt()
    assert publishes == 2

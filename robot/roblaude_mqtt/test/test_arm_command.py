"""Tests validate_arm_command — clamp + erreurs."""
from unittest.mock import MagicMock, patch


def _stubs():
    return {
        'rclpy': MagicMock(), 'rclpy.node': MagicMock(),
        'std_msgs.msg': MagicMock(), 'nav_msgs.msg': MagicMock(),
        'sensor_msgs.msg': MagicMock(), 'geometry_msgs.msg': MagicMock(),
        'visualization_msgs.msg': MagicMock(), 'tf2_msgs.msg': MagicMock(),
        'paho': MagicMock(), 'paho.mqtt': MagicMock(), 'paho.mqtt.client': MagicMock(),
        'arm_msgs': MagicMock(), 'arm_msgs.msg': MagicMock(),
    }


def _load():
    with patch.dict('sys.modules', _stubs()):
        from roblaude_mqtt.mqtt_bridge import validate_arm_command
        return validate_arm_command


def test_validate_arm_command_happy_path():
    # Convention Yahboom : 0..180, HOME = [90, 120, 10, 20, 90, 0]
    fn = _load()
    joints, t = fn({
        'joint1': 90, 'joint2': 120, 'joint3': 10,
        'joint4': 20, 'joint5': 90, 'joint6': 0, 'time': 2000,
    })
    assert joints == [90, 120, 10, 20, 90, 0]
    assert t == 2000


def test_validate_arm_command_clamps_angles():
    # Yahboom : 0..180 unsigned
    fn = _load()
    joints, _ = fn({
        'joint1': 999, 'joint2': -50, 'joint3': 90,
        'joint4': 90, 'joint5': 90, 'joint6': 250, 'time': 2000,
    })
    assert joints[0] == 180   # 999 clamp a 180 (max)
    assert joints[1] == 0     # -50 clamp a 0 (min)
    assert joints[5] == 180   # 250 clamp a 180


def test_validate_arm_command_clamps_time():
    fn = _load()
    _, t_too_fast = fn({
        'joint1': 90, 'joint2': 90, 'joint3': 90,
        'joint4': 90, 'joint5': 90, 'joint6': 0, 'time': 100,
    })
    _, t_too_slow = fn({
        'joint1': 90, 'joint2': 90, 'joint3': 90,
        'joint4': 90, 'joint5': 90, 'joint6': 0, 'time': 99999,
    })
    assert t_too_fast == 500   # min (selon doc Yahboom : < 500ms = saccade)
    assert t_too_slow == 5000  # max


def test_validate_arm_command_default_time():
    fn = _load()
    _, t = fn({
        'joint1': 0, 'joint2': 0, 'joint3': 0,
        'joint4': 0, 'joint5': 0, 'joint6': 0,
    })
    assert t == 500  # default


def test_validate_arm_command_missing_joint():
    fn = _load()
    try:
        fn({'joint1': 0, 'joint2': 0, 'joint3': 0, 'joint4': 0, 'joint5': 0})
        assert False, 'should have raised'
    except ValueError as e:
        assert 'joint6' in str(e)


def test_validate_arm_command_non_numeric():
    fn = _load()
    try:
        fn({
            'joint1': 'oops', 'joint2': 0, 'joint3': 0,
            'joint4': 0, 'joint5': 0, 'joint6': 0,
        })
        assert False
    except ValueError:
        pass

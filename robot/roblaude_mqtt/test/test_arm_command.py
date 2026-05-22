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
    fn = _load()
    joints, t = fn({
        'joint1': 10, 'joint2': -20, 'joint3': 30,
        'joint4': -40, 'joint5': 50, 'joint6': 90, 'time': 800,
    })
    assert joints == [10, -20, 30, -40, 50, 90]
    assert t == 800


def test_validate_arm_command_clamps_angles():
    fn = _load()
    joints, _ = fn({
        'joint1': 999, 'joint2': -999, 'joint3': 0,
        'joint4': 0, 'joint5': 0, 'joint6': 200, 'time': 500,
    })
    # joint1 clamp a 180, joint2 a -180, joint6 a 180
    assert joints[0] == 180
    assert joints[1] == -180
    assert joints[5] == 180


def test_validate_arm_command_clamps_time():
    fn = _load()
    _, t_too_fast = fn({
        'joint1': 0, 'joint2': 0, 'joint3': 0,
        'joint4': 0, 'joint5': 0, 'joint6': 0, 'time': 10,
    })
    _, t_too_slow = fn({
        'joint1': 0, 'joint2': 0, 'joint3': 0,
        'joint4': 0, 'joint5': 0, 'joint6': 0, 'time': 99999,
    })
    assert t_too_fast == 50    # min
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

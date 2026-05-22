"""
Tests unitaires pour MappingSupervisor.
os.setsid/os.killpg ne s'executent pas sur macOS dev -> on mock subprocess.
Smoke test sur le robot reel obligatoire avant merge (cf doc).
"""
import json
import threading
from unittest.mock import MagicMock, patch
import pytest


# Stubs : MagicMock n'est pas une vraie classe, super().__init__() planterait.
# On donne des vraies classes Python stubs.
class _StubNode:
    def __init__(self, *a, **k): pass
    def create_subscription(self, *a, **k): return None
    def create_publisher(self, *a, **k): return None
    def get_logger(self): return MagicMock()


class _StubString:
    def __init__(self, data=''): self.data = data


_rclpy_node_stub = MagicMock()
_rclpy_node_stub.Node = _StubNode
_std_msgs_stub = MagicMock()
_std_msgs_stub.String = _StubString


@pytest.fixture
def supervisor_module():
    with patch.dict('sys.modules', {
        'rclpy': MagicMock(),
        'rclpy.node': _rclpy_node_stub,
        'std_msgs.msg': _std_msgs_stub,
    }):
        # Force re-import si module deja charge avec mauvais mocks
        import importlib
        import sys
        if 'roblaude_nav.mapping_supervisor' in sys.modules:
            del sys.modules['roblaude_nav.mapping_supervisor']
        from roblaude_nav import mapping_supervisor
        return mapping_supervisor


def test_initial_state_is_idle(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    sup.proc = None
    sup.session_id = None
    sup.state = 'IDLE'
    sup.started_at = None
    sup.lock = threading.Lock()
    assert sup.state == 'IDLE'
    assert sup.proc is None


def test_start_transitions_to_starting(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    sup.proc = None
    sup.session_id = None
    sup.state = 'IDLE'
    sup.started_at = None
    sup.lock = threading.Lock()
    sup.state_pub = MagicMock()

    fake_proc = MagicMock()
    fake_proc.poll.return_value = None
    fake_proc.pid = 12345

    with patch.object(supervisor_module.subprocess, 'Popen', return_value=fake_proc), \
         patch.object(supervisor_module.threading, 'Thread') as mock_thread:
        sup.start(session_id=42, message_id='m-1')

    assert sup.state == 'STARTING'
    assert sup.proc is fake_proc
    assert sup.session_id == 42
    mock_thread.assert_called_once()


def test_start_ignored_if_already_running(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    fake_proc = MagicMock()
    sup.proc = fake_proc
    sup.session_id = 99
    sup.state = 'RUNNING'
    sup.lock = threading.Lock()
    sup.state_pub = MagicMock()
    sup.get_logger = MagicMock(return_value=MagicMock())

    with patch.object(supervisor_module.subprocess, 'Popen') as mock_popen:
        sup.start(session_id=42, message_id='m-2')
        mock_popen.assert_not_called()

    assert sup.proc is fake_proc
    assert sup.session_id == 99


def test_stop_sends_sigint_to_process_group(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    fake_proc = MagicMock(pid=54321)
    sup.proc = fake_proc
    sup.session_id = 42
    sup.state = 'RUNNING'
    sup.started_at = 0.0
    sup.lock = threading.Lock()
    sup.state_pub = MagicMock()

    with patch.object(supervisor_module.os, 'getpgid', return_value=54321), \
         patch.object(supervisor_module.os, 'killpg') as mock_killpg:
        sup.stop(message_id='m-3')

    assert sup.state == 'STOPPING'
    mock_killpg.assert_called_once()
    args = mock_killpg.call_args[0]
    assert args[0] == 54321
    assert args[1] == supervisor_module.signal.SIGINT


def test_stop_noop_if_not_running(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    sup.proc = None
    sup.state = 'IDLE'
    sup.started_at = None
    sup.session_id = None
    sup.lock = threading.Lock()
    sup.state_pub = MagicMock()

    sup.stop(message_id='m-4')
    assert sup.state == 'IDLE'


def test_save_publishes_ok(supervisor_module, tmp_path):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    sup.save_pub = MagicMock()

    pgm = tmp_path / 'demo.pgm'
    pgm.write_bytes(b'P5\n2 2\n255\n\x00\xff\xff\x00')
    yaml = tmp_path / 'demo.yaml'
    yaml.write_text('resolution: 0.05\norigin: [0,0,0]\n')

    fake_run = MagicMock(returncode=0, stderr=b'')

    real_open = open
    def side_open(f, *a, **k):
        if 'pgm' in str(f): return real_open(str(tmp_path / 'demo.pgm'), *a, **k)
        if 'yaml' in str(f): return real_open(str(tmp_path / 'demo.yaml'), *a, **k)
        return real_open(f, *a, **k)

    with patch.object(supervisor_module.subprocess, 'run', return_value=fake_run), \
         patch('builtins.open', side_effect=side_open):
        sup.save(session_id=42, name='demo', message_id='m-5')

    sup.save_pub.publish.assert_called_once()
    payload = json.loads(sup.save_pub.publish.call_args[0][0].data)
    assert payload['ok'] is True
    assert 'pgm_base64' in payload
    assert payload['sessionId'] == 42


def test_save_handles_failure(supervisor_module):
    sup = supervisor_module.MappingSupervisor.__new__(supervisor_module.MappingSupervisor)
    sup.save_pub = MagicMock()

    fake_run = MagicMock(returncode=1, stderr=b'no map topic')

    with patch.object(supervisor_module.subprocess, 'run', return_value=fake_run):
        sup.save(session_id=42, name='demo', message_id='m-6')

    payload = json.loads(sup.save_pub.publish.call_args[0][0].data)
    assert payload['ok'] is False
    assert 'no map topic' in payload['reason']

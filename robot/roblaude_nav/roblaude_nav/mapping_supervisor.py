"""
Supervisor du mode mapping. Recoit les commandes MQTT cmd/mapping/*
(routees par le bridge MQTT sur le topic ROS interne /mqtt/cmd/mapping),
pilote subprocess.Popen sur explore.launch.py, publie mapping/state.

Etats : IDLE -> STARTING -> RUNNING -> STOPPING -> STOPPED | FAILED
"""
import os
import json
import time
import signal
import threading
import subprocess
import base64

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


CMD_TOPIC = '/mqtt/cmd/mapping'
STATE_TOPIC = '/mqtt/mapping/state'
SAVE_RESULT_TOPIC = '/mqtt/mapping/save_result'


class MappingSupervisor(Node):
    def __init__(self):
        super().__init__('mapping_supervisor')
        self.proc = None
        self.session_id = None
        self.state = 'IDLE'
        self.started_at = None
        self.lock = threading.Lock()

        self.cmd_sub = self.create_subscription(String, CMD_TOPIC, self._on_cmd, 10)
        self.state_pub = self.create_publisher(String, STATE_TOPIC, 10)
        self.save_pub = self.create_publisher(String, SAVE_RESULT_TOPIC, 10)

        self.publish_state()  # etat initial annonce au boot
        self.get_logger().info('mapping_supervisor pret')

    def _on_cmd(self, msg: String):
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError as e:
            self.get_logger().error(f'cmd JSON invalide: {e}')
            return
        action = data.get('action')
        if action == 'start':
            self.start(data.get('sessionId'), data.get('messageId'))
        elif action == 'stop':
            self.stop(data.get('messageId'))
        elif action == 'save':
            self.save(data.get('sessionId'), data.get('name'), data.get('messageId'))
        else:
            self.get_logger().warn(f'action inconnue: {action}')

    def start(self, session_id, message_id):
        with self.lock:
            if self.proc is not None:
                self.get_logger().warn('mapping deja en cours, ignore start')
                return
            self.session_id = session_id
            self.state = 'STARTING'
            self.started_at = time.time()
            self.publish_state()
            try:
                self.proc = subprocess.Popen(
                    ['ros2', 'launch', 'roblaude_nav', 'explore.launch.py'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    preexec_fn=os.setsid,  # nouveau process group pour kill propre
                )
                threading.Thread(target=self._watch, daemon=True).start()
            except Exception as e:
                self.state = 'FAILED'
                self.publish_state(failure_reason=str(e))
                self.proc = None

    def _watch(self):
        # apres 5s sans crash, on passe a RUNNING
        time.sleep(5)
        with self.lock:
            if self.proc and self.proc.poll() is None and self.state == 'STARTING':
                self.state = 'RUNNING'
                self.publish_state()
        # bloque jusqu'a fin du process — soit normal, soit crash
        rc = self.proc.wait()
        with self.lock:
            if self.state != 'STOPPING':
                self.state = 'FAILED'
                err = self.proc.stderr.read().decode('utf-8', errors='ignore')[-500:]
                self.publish_state(failure_reason=f'launch exited rc={rc}\n{err}')
            else:
                self.state = 'STOPPED'
                self.publish_state()
            self.proc = None

    def stop(self, message_id):
        with self.lock:
            if self.proc is None:
                return
            self.state = 'STOPPING'
            self.publish_state()
            try:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGINT)
            except ProcessLookupError:
                # process deja fini, _watch fera la transition
                pass

    def save(self, session_id, name, message_id):
        name = name or f'session-{session_id}'
        out = f'/tmp/{name}'
        try:
            r = subprocess.run(
                ['ros2', 'run', 'nav2_map_server', 'map_saver_cli', '-f', out],
                capture_output=True, timeout=30,
            )
            if r.returncode != 0:
                self.save_pub.publish(String(data=json.dumps({
                    'messageId': message_id, 'ok': False,
                    'reason': r.stderr.decode('utf-8', errors='ignore')[-300:],
                })))
                return
            with open(f'{out}.pgm', 'rb') as f:
                pgm_b64 = base64.b64encode(f.read()).decode('ascii')
            with open(f'{out}.yaml') as f:
                yaml_content = f.read()
            self.save_pub.publish(String(data=json.dumps({
                'messageId': message_id, 'ok': True,
                'sessionId': session_id, 'name': name,
                'pgm_base64': pgm_b64, 'yaml': yaml_content,
            })))
        except subprocess.TimeoutExpired:
            self.save_pub.publish(String(data=json.dumps({
                'messageId': message_id, 'ok': False,
                'reason': 'timeout 30s map_saver_cli',
            })))

    def publish_state(self, failure_reason=None):
        payload = {
            'state': self.state,
            'sessionId': self.session_id,
            'startedAt': self.started_at,
        }
        if failure_reason:
            payload['failureReason'] = failure_reason
        self.state_pub.publish(String(data=json.dumps(payload)))


def main(args=None):
    rclpy.init(args=args)
    node = MappingSupervisor()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()

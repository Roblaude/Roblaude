#!/usr/bin/env python3
"""mission_executor — orchestrateur de mission cote robot (T3.2.5).

Ecoute les commandes MQTT relayees par le bridge (topics ROS mqtt/mission,
mqtt/cancel, mqtt/resume, mqtt/loading_confirmed, mqtt/emergency_stop) et
pilote Nav2. Publie mission/ack -> mission/status -> mission/result au fil
de la mission (republies en MQTT par le bridge).

Sur cmd/mission :
  - extrait toPoint{x,y,theta} (frame: map),
  - construit un goal NavigateToPose et l'envoie sur l'action /navigate_to_pose,
  - publie ack -> status -> result au fil de la mission,
  - le robot bouge en vrai (Nav2 + costmaps + SLAM).

Sur cmd/cancel : annule le goal Nav2 en cours.
Sur cmd/emergency-stop : annule + envoie Twist zero sur /cmd_vel.

A lancer apres Nav2 :
    ros2 run roblaude_nav mission_executor
"""
import json
import math
from datetime import datetime, timezone

import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node

from action_msgs.msg import GoalStatus
from geometry_msgs.msg import Twist
from nav2_msgs.action import NavigateToPose
from std_msgs.msg import String

SCHEMA_VERSION = 1

# Topics ROS publies par le bridge (cf. CMD_TO_ROS_TOPIC dans mqtt_bridge.py)
CMD_TOPICS = ['mqtt/mission', 'mqtt/cancel', 'mqtt/resume',
              'mqtt/loading_confirmed', 'mqtt/emergency_stop']


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


class MissionExecutor(Node):
    def __init__(self):
        super().__init__('mission_executor_stub')

        # Reponses vers le bridge — il les republie en MQTT
        self.ack_pub = self.create_publisher(String, 'mission/ack', 10)
        self.status_pub = self.create_publisher(String, 'mission/status', 10)
        self.result_pub = self.create_publisher(String, 'mission/result', 10)
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)

        # Action client vers Nav2
        self.nav_client = ActionClient(self, NavigateToPose, '/navigate_to_pose')

        # Etat de la mission en cours
        self.current_goal_handle = None
        self.current_mission_id = None

        for topic in CMD_TOPICS:
            self.create_subscription(
                String, topic, lambda msg, t=topic: self._on_cmd(t, msg), 10)

        self.get_logger().info('mission_executor pret — attend cmd/* via MQTT bridge')

    # ------------- entree des commandes MQTT -------------

    def _on_cmd(self, topic, msg):
        action = topic.split('/')[-1]
        self.get_logger().info(f"recu '{action}' : {msg.data}")
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warn('payload non JSON, ignore')
            return

        if action == 'mission':
            self._drive_mission(data)
        elif action == 'cancel':
            self._cancel_mission(data.get('missionId'))
        elif action == 'emergency_stop':
            self._emergency_stop()
        # resume / loading_confirmed : pas de logique pour l'instant

    # ------------- pilotage Nav2 -------------

    def _drive_mission(self, data):
        mission_id = data.get('missionId')
        to_point = data.get('toPoint') or {}
        x = float(to_point.get('x', 0.0))
        y = float(to_point.get('y', 0.0))
        theta = float(to_point.get('theta', 0.0))

        # ack tout de suite
        self._send(self.ack_pub,
                   {'missionId': mission_id, 'result': 'accepted'},
                   with_message_id=True)
        self.get_logger().info(f'-> ack accepted (mission {mission_id})')

        # construit le goal
        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = 'map'
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.z = math.sin(theta / 2.0)
        goal.pose.pose.orientation.w = math.cos(theta / 2.0)

        # check action server
        if not self.nav_client.wait_for_server(timeout_sec=2.0):
            self.get_logger().error('Nav2 indisponible (/navigate_to_pose timeout)')
            self._send(self.result_pub,
                       {'missionId': mission_id, 'result': 'failed',
                        'reason': 'nav-server-unavailable'},
                       with_message_id=True)
            return

        self.current_mission_id = mission_id
        self.get_logger().info(f'envoi goal Nav2 -> map ({x:.2f}, {y:.2f}, theta {theta:.2f})')
        future = self.nav_client.send_goal_async(
            goal, feedback_callback=self._on_nav_feedback)
        future.add_done_callback(self._on_nav_goal_response)

    def _on_nav_goal_response(self, future):
        goal_handle = future.result()
        mid = self.current_mission_id
        if not goal_handle.accepted:
            self.get_logger().warn(f'goal rejete (mission {mid})')
            self._send(self.result_pub,
                       {'missionId': mid, 'result': 'failed',
                        'reason': 'goal-rejected'},
                       with_message_id=True)
            self.current_mission_id = None
            return

        self.current_goal_handle = goal_handle
        self._send(self.status_pub,
                   {'missionId': mid, 'state': 'NAVIGATING_TO_DELIVERY'})
        self.get_logger().info(f'-> status NAVIGATING (mission {mid})')

        result_future = goal_handle.get_result_async()
        result_future.add_done_callback(self._on_nav_result)

    def _on_nav_feedback(self, feedback_msg):
        # Nav2 fournit distance_remaining et navigation_time ; on pourrait les
        # publier dans mission/status si on veut un progress detaille. Pour
        # l'instant on ne publie qu'au changement d'etat (eviter le spam MQTT).
        pass

    def _on_nav_result(self, future):
        result = future.result()
        mid = self.current_mission_id
        status = result.status
        if status == GoalStatus.STATUS_SUCCEEDED:
            self._send(self.result_pub,
                       {'missionId': mid, 'result': 'completed'},
                       with_message_id=True)
            self.get_logger().info(f'-> result completed (mission {mid})')
        elif status == GoalStatus.STATUS_CANCELED:
            self._send(self.result_pub,
                       {'missionId': mid, 'result': 'cancelled'},
                       with_message_id=True)
            self.get_logger().info(f'-> result cancelled (mission {mid})')
        else:
            self._send(self.result_pub,
                       {'missionId': mid, 'result': 'failed',
                        'reason': f'nav-status-{status}'},
                       with_message_id=True)
            self.get_logger().warn(f'-> result failed status={status} (mission {mid})')

        self.current_goal_handle = None
        self.current_mission_id = None

    def _cancel_mission(self, mission_id):
        if self.current_goal_handle is None:
            self.get_logger().info(f'cancel mais aucun goal en cours (mission {mission_id})')
            return
        self.get_logger().info(f'-> annule mission {mission_id}')
        self.current_goal_handle.cancel_goal_async()

    def _emergency_stop(self):
        self.get_logger().warn('EMERGENCY STOP recu')
        if self.current_goal_handle is not None:
            self.current_goal_handle.cancel_goal_async()
        # Twist zero pour stopper le robot immediatement
        self.cmd_vel_pub.publish(Twist())

    # ------------- helpers -------------

    def _send(self, pub, payload, with_message_id=False):
        body = {'schemaVersion': SCHEMA_VERSION, 'timestamp': now_iso(), **payload}
        if with_message_id:
            import uuid
            body['messageId'] = str(uuid.uuid4())
        pub.publish(String(data=json.dumps(body)))


def main(args=None):
    rclpy.init(args=args)
    node = MissionExecutor()
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

#!/usr/bin/env python3
"""mission_executor — orchestrateur de mission cote robot.

Ecoute les commandes MQTT relayees par le bridge (mqtt/mission, mqtt/cancel,
mqtt/resume, mqtt/loading_confirmed, mqtt/emergency_stop) et pilote Nav2 + le
bras. Publie mission/ack -> mission/status -> mission/result au fil de la
mission (republies en MQTT par le bridge).

Deux types de mission (cf. docs/mqtt-spec.md) :

  TRANSPORT (UC-01) :
    nav vers toPoint, statut NAVIGATING_TO_DELIVERY, puis result.

  PICK_AND_PLACE (UC-02) :
    NAVIGATING_TO_PICKUP (nav -> fromPoint)
    -> DETECTING_OBJECT (attend /roblaude/detections, transfo TF -> base_link)
    -> GRASPING (IK + saisie sur /arm6_joints, pince fermee)
    -> NAVIGATING_TO_DESTINATION (nav -> toPoint, bras en pose transport)
    -> DEPOSITING (descend + ouvre pince)
    -> result {completed | failed:grasp-failed}.

mission_executor est le SEUL a piloter /cmd_vel, /arm6_joints et Nav2 : pas de
conflit d'actionneur. La vision (object_detector) ne fait qu'observer.

A lancer apres Nav2 :
    ros2 run roblaude_nav mission_executor
"""
import json
import math
import uuid
from datetime import datetime, timezone

import rclpy
from rclpy.action import ActionClient
from rclpy.node import Node

from action_msgs.msg import GoalStatus
from geometry_msgs.msg import PoseArray, Twist
from nav2_msgs.action import NavigateToPose
from std_msgs.msg import String

import tf2_ros

from roblaude_pickplace.arm_kin import ArmGeometry, compute_ik, rad_to_servo
from roblaude_pickplace.detection import select_best_detection, transform_point

# arm_msgs vient du workspace Yahboom. Import optionnel : sans lui, les commandes
# bras sont loggees mais pas envoyees (utile en simu/CI).
try:
    from arm_msgs.msg import ArmJoint, ArmJoints
    HAS_ARM_MSGS = True
except ImportError:
    ArmJoint = None
    ArmJoints = None
    HAS_ARM_MSGS = False

# Pince (gripper) = servo id 6, pilote par le message single-servo ArmJoint sur
# /arm_joint (canal fiable, verifie en reel). Convention de CE bras :
# 0 = OUVERT, 180 = FERME (inverse de la doc generique). joint6 de /arm6_joints
# ne fait pas un open/close propre — on passe donc par /arm_joint.
GRIPPER_SERVO_ID = 6
GRIPPER_OPEN = 0
GRIPPER_CLOSE = 180

SCHEMA_VERSION = 1

CMD_TOPICS = ['mqtt/mission', 'mqtt/cancel', 'mqtt/resume',
              'mqtt/loading_confirmed', 'mqtt/emergency_stop']

# Poses bras (radians) — base_yaw, epaule, coude, wrist_pitch, wrist_roll.
# Transport : bras releve, pince fermee, pour porter l'objet sans le trainer.
CARRY_POSE = (0.0, math.radians(30), math.radians(-60), math.radians(-30), 0.0)
# Depot : bras avance/baisse avant d'ouvrir la pince.
DEPOSIT_POSE = (0.0, math.radians(45), math.radians(-80), math.radians(-30), 0.0)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


class MissionExecutor(Node):
    def __init__(self):
        super().__init__('mission_executor')

        # Reponses vers le bridge — il les republie en MQTT
        self.ack_pub = self.create_publisher(String, 'mission/ack', 10)
        self.status_pub = self.create_publisher(String, 'mission/status', 10)
        self.result_pub = self.create_publisher(String, 'mission/result', 10)
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        # Couleur cible imposee au detecteur (Option 2 : couleur du GraspObject)
        self.color_pub = self.create_publisher(String, '/roblaude/target_color', 10)
        # Bras Yahboom : joints 1-5 sur /arm6_joints (ArmJoints), pince sur
        # /arm_joint (ArmJoint, single servo id=6) — canal fiable pour la pince.
        if HAS_ARM_MSGS:
            self.arm_pub = self.create_publisher(ArmJoints, '/arm6_joints', 10)
            self.gripper_pub = self.create_publisher(ArmJoint, '/arm_joint', 10)
        else:
            self.arm_pub = None
            self.gripper_pub = None
            self.get_logger().warn('arm_msgs absent — commandes bras loggees seulement')

        # Action client vers Nav2
        self.nav_client = ActionClient(self, NavigateToPose, '/navigate_to_pose')

        # Detections de l'object_detector
        self.create_subscription(PoseArray, '/roblaude/detections',
                                 self._on_detections, 10)

        # TF pour passer une detection (repere optique camera) -> base_link
        self.tf_buffer = tf2_ros.Buffer()
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)

        # --- Parametres bras / pick&place ---
        self.gripper_open = int(
            self.declare_parameter('gripper_open_value', GRIPPER_OPEN).value)
        self.gripper_close = int(
            self.declare_parameter('gripper_close_value', GRIPPER_CLOSE).value)
        self.detect_timeout = float(self.declare_parameter('detect_timeout', 15.0).value)
        self.grasp_step_period = float(self.declare_parameter('grasp_step_period', 1.5).value)
        self.deposit_period = float(self.declare_parameter('deposit_period', 2.0).value)
        self.arm_time_ms = int(self.declare_parameter('arm_time_ms', 1000).value)
        self.geom = ArmGeometry()

        # --- Etat mission courante ---
        self.current_goal_handle = None
        self.current_mission_id = None
        self.nav_done = None       # callback de fin de nav en cours
        self.pp = None             # data de la mission PICK_AND_PLACE en cours
        self.phase = None
        self.detecting = False
        self.detect_deadline = 0.0
        self.detect_timer = None
        self.grasp_target = None
        self.grasp_joints = None
        self.grasp_step = 0
        self.grasp_timer = None
        self.deposit_timer = None

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
            if (data.get('type') or 'TRANSPORT').upper() == 'PICK_AND_PLACE':
                self._start_pick_and_place(data)
            else:
                self._drive_transport(data)
        elif action == 'cancel':
            self._cancel_mission(data.get('missionId'))
        elif action == 'emergency_stop':
            self._emergency_stop()
        # resume / loading_confirmed : pas de logique pour l'instant

    # ------------- helper Nav2 generique -------------

    def _send_nav_goal(self, point, on_done):
        """Envoie un goal NavigateToPose vers point{x,y,theta}. on_done(ok, reason)
        est appele a la fin (reason='cancelled' si annule)."""
        x = float(point.get('x', 0.0))
        y = float(point.get('y', 0.0))
        theta = float(point.get('theta', 0.0))

        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = 'map'
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.z = math.sin(theta / 2.0)
        goal.pose.pose.orientation.w = math.cos(theta / 2.0)

        if not self.nav_client.wait_for_server(timeout_sec=2.0):
            self.get_logger().error('Nav2 indisponible (/navigate_to_pose timeout)')
            on_done(False, 'nav-server-unavailable')
            return

        self.nav_done = on_done
        self.get_logger().info(f'envoi goal Nav2 -> map ({x:.2f}, {y:.2f}, theta {theta:.2f})')
        future = self.nav_client.send_goal_async(goal, feedback_callback=self._on_nav_feedback)
        future.add_done_callback(self._on_nav_goal_response)

    def _on_nav_goal_response(self, future):
        goal_handle = future.result()
        on_done = self.nav_done
        if not goal_handle.accepted:
            self.get_logger().warn('goal Nav2 rejete')
            if on_done:
                on_done(False, 'goal-rejected')
            return
        self.current_goal_handle = goal_handle
        result_future = goal_handle.get_result_async()
        result_future.add_done_callback(self._on_nav_result)

    def _on_nav_feedback(self, feedback_msg):
        # distance_remaining dispo si on veut un progress detaille plus tard
        pass

    def _on_nav_result(self, future):
        status = future.result().status
        self.current_goal_handle = None
        on_done = self.nav_done
        self.nav_done = None
        if on_done is None:
            return
        if status == GoalStatus.STATUS_SUCCEEDED:
            on_done(True, None)
        elif status == GoalStatus.STATUS_CANCELED:
            on_done(False, 'cancelled')
        else:
            on_done(False, f'nav-status-{status}')

    # ------------- TRANSPORT (UC-01) -------------

    def _drive_transport(self, data):
        mid = data.get('missionId')
        self.current_mission_id = mid
        self._send(self.ack_pub, {'missionId': mid, 'result': 'accepted'},
                   with_message_id=True)
        self.get_logger().info(f'-> ack accepted (mission {mid})')

        self._send(self.status_pub, {'missionId': mid, 'state': 'NAVIGATING_TO_DELIVERY'})
        self._send_nav_goal(data.get('toPoint') or {}, self._on_transport_done)

    def _on_transport_done(self, ok, reason):
        mid = self.current_mission_id
        if ok:
            self._send(self.result_pub, {'missionId': mid, 'result': 'completed'},
                       with_message_id=True)
            self.get_logger().info(f'-> result completed (mission {mid})')
        elif reason == 'cancelled':
            self._send(self.result_pub, {'missionId': mid, 'result': 'cancelled'},
                       with_message_id=True)
        else:
            self._send(self.result_pub,
                       {'missionId': mid, 'result': 'failed', 'reason': reason},
                       with_message_id=True)
            self.get_logger().warn(f'-> result failed ({reason}) (mission {mid})')
        self.current_mission_id = None

    # ------------- PICK_AND_PLACE (UC-02) -------------

    def _start_pick_and_place(self, data):
        mid = data.get('missionId')
        self.current_mission_id = mid
        self.pp = data
        self._send(self.ack_pub, {'missionId': mid, 'result': 'accepted'},
                   with_message_id=True)
        self.get_logger().info(f'-> ack accepted (pick&place {mid})')

        # Couleur cible (Option 2) : le backend met la couleur du GraspObject
        color = data.get('targetColor') or data.get('color')
        if color:
            self.color_pub.publish(String(data=str(color)))
            self.get_logger().info(f'couleur cible imposee : {color}')

        self.phase = 'NAVIGATING_TO_PICKUP'
        self._send(self.status_pub, {'missionId': mid, 'state': 'NAVIGATING_TO_PICKUP'})
        self._send_nav_goal(data.get('fromPoint') or {}, self._on_pickup_reached)

    def _on_pickup_reached(self, ok, reason):
        if not ok:
            self._finish_pp('cancelled' if reason == 'cancelled' else 'failed', reason)
            return
        # DETECTING_OBJECT : on ecoute les detections jusqu'au timeout
        mid = self.current_mission_id
        self.phase = 'DETECTING_OBJECT'
        self._send(self.status_pub, {'missionId': mid, 'state': 'DETECTING_OBJECT'})
        self.detecting = True
        self.detect_deadline = self.get_clock().now().nanoseconds / 1e9 + self.detect_timeout
        self.detect_timer = self.create_timer(0.2, self._check_detect_timeout)

    def _on_detections(self, msg):
        if not self.detecting:
            return
        best = select_best_detection(
            [(p.position.x, p.position.y, p.position.z) for p in msg.poses])
        if best is None:
            return
        target = self._to_base_link(best, msg.header.frame_id)
        if target is None:
            return  # TF pas prete, on retentera a la prochaine detection

        self.detecting = False
        self._cancel_timer('detect_timer')
        self.grasp_target = target
        self.get_logger().info('objet localise en base_link (%.3f, %.3f, %.3f)' % target)
        self._start_grasp()

    def _check_detect_timeout(self):
        if not self.detecting:
            return
        if self.get_clock().now().nanoseconds / 1e9 > self.detect_deadline:
            self.detecting = False
            self._cancel_timer('detect_timer')
            self.get_logger().warn('aucun objet detecte avant timeout')
            self._finish_pp('failed', 'grasp-failed')

    def _to_base_link(self, point, frame_id):
        """Detection (repere optique camera) -> base_link via TF. None si TF absente."""
        try:
            tf = self.tf_buffer.lookup_transform(
                'base_link', frame_id or 'camera_color_optical_frame',
                rclpy.time.Time())
        except tf2_ros.TransformException as e:
            self.get_logger().warn(f'TF base_link<-{frame_id} indispo : {e}',
                                   throttle_duration_sec=2.0)
            return None
        t = tf.transform.translation
        q = tf.transform.rotation
        return transform_point(point[0], point[1], point[2],
                               t.x, t.y, t.z, q.x, q.y, q.z, q.w)

    def _start_grasp(self):
        mid = self.current_mission_id
        self.phase = 'GRASPING'
        self._send(self.status_pub, {'missionId': mid, 'state': 'GRASPING'})

        joints = compute_ik(self.grasp_target[0], self.grasp_target[1],
                            self.grasp_target[2], self.geom)
        if joints is None:
            self.get_logger().warn('objet hors de portee du bras (IK None)')
            self._finish_pp('failed', 'grasp-failed')
            return
        self.grasp_joints = joints
        self.grasp_step = 0
        self.grasp_timer = self.create_timer(self.grasp_step_period, self._grasp_tick)

    def _grasp_tick(self):
        step = self.grasp_step
        self.grasp_step += 1
        if step == 0:
            self._send_arm(self.grasp_joints, self.gripper_open)   # approche, pince ouverte
        elif step == 1:
            self._send_arm(self.grasp_joints, self.gripper_close)  # ferme sur l'objet
        elif step == 2:
            self._send_arm(CARRY_POSE, self.gripper_close)         # releve, pince fermee
        else:
            self._cancel_timer('grasp_timer')
            self._after_grasp()

    def _after_grasp(self):
        mid = self.current_mission_id
        self.phase = 'NAVIGATING_TO_DESTINATION'
        self._send(self.status_pub, {'missionId': mid, 'state': 'NAVIGATING_TO_DESTINATION'})
        self._send_nav_goal(self.pp.get('toPoint') or {}, self._on_destination_reached)

    def _on_destination_reached(self, ok, reason):
        if not ok:
            self._finish_pp('cancelled' if reason == 'cancelled' else 'failed', reason)
            return
        mid = self.current_mission_id
        self.phase = 'DEPOSITING'
        self._send(self.status_pub, {'missionId': mid, 'state': 'DEPOSITING'})
        self._send_arm(DEPOSIT_POSE, self.gripper_open)  # descend + ouvre pince
        self.deposit_timer = self.create_timer(self.deposit_period, self._deposit_done)

    def _deposit_done(self):
        self._cancel_timer('deposit_timer')
        self._finish_pp('completed', None)

    def _finish_pp(self, result, reason):
        mid = self.current_mission_id
        payload = {'missionId': mid, 'result': result}
        if reason and result == 'failed':
            payload['reason'] = reason
        self._send(self.result_pub, payload, with_message_id=True)
        self.get_logger().info(f'-> result {result} ({reason}) (pick&place {mid})')
        self._reset_pp()

    def _reset_pp(self):
        self._cancel_timer('detect_timer')
        self._cancel_timer('grasp_timer')
        self._cancel_timer('deposit_timer')
        self.pp = None
        self.phase = None
        self.detecting = False
        self.grasp_target = None
        self.grasp_joints = None
        self.current_mission_id = None

    # ------------- cancel / emergency -------------

    def _cancel_mission(self, mission_id):
        if self.current_goal_handle is not None:
            self.get_logger().info(f'-> annule nav (mission {mission_id})')
            self.current_goal_handle.cancel_goal_async()  # le callback nav fera 'cancelled'
        elif self.pp is not None:
            self._finish_pp('cancelled', None)
        else:
            self.get_logger().info(f'cancel mais rien en cours (mission {mission_id})')

    def _emergency_stop(self):
        self.get_logger().warn('EMERGENCY STOP recu')
        if self.current_goal_handle is not None:
            self.current_goal_handle.cancel_goal_async()
        self.cmd_vel_pub.publish(Twist())  # stoppe le robot tout de suite
        self._reset_pp()

    # ------------- helpers -------------

    def _send_arm(self, joints5, gripper_servo):
        """5 angles radians (rad_to_servo: 0 rad = 90 = neutre) -> /arm6_joints,
        + la pince via /arm_joint (canal fiable). joint6 de /arm6_joints recopie
        juste la valeur pince pour rester coherent."""
        servos = [int(rad_to_servo(a)) for a in joints5]
        if self.arm_pub is not None:
            msg = ArmJoints()
            msg.joint1, msg.joint2, msg.joint3 = servos[0], servos[1], servos[2]
            msg.joint4, msg.joint5 = servos[3], servos[4]
            msg.joint6 = int(gripper_servo)
            msg.time = self.arm_time_ms
            self.arm_pub.publish(msg)
        self._send_gripper(gripper_servo)
        self.get_logger().info(f'bras -> {servos} pince={gripper_servo}')

    def _send_gripper(self, value):
        """Pince via /arm_joint single-servo id=6 (canal fiable). 0=ouvert, 180=ferme."""
        if self.gripper_pub is None:
            return
        msg = ArmJoint()
        msg.id = GRIPPER_SERVO_ID
        msg.joint = int(value)
        msg.time = self.arm_time_ms
        self.gripper_pub.publish(msg)

    def _cancel_timer(self, attr):
        timer = getattr(self, attr, None)
        if timer is not None:
            timer.cancel()
            self.destroy_timer(timer)
            setattr(self, attr, None)

    def _send(self, pub, payload, with_message_id=False):
        body = {'schemaVersion': SCHEMA_VERSION, 'timestamp': now_iso(), **payload}
        if with_message_id:
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

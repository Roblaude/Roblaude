#!/usr/bin/env python3
# Noeud pont MQTT <-> ROS 2 : seul point d'entree des commandes externes.
# Topics et formats des messages : voir docs/mqtt-spec.md
#
# Squelette (ticket T4.1.1) : la connexion au broker, le Last Will et le
# routage des topics sont fonctionnels. Le cablage vers le graphe ROS utilise
# std_msgs/String en attendant les vrais messages : il faudra les brancher
# une fois le mission_executor (T3.2.5) et la publication de position (T3.2.8)
# disponibles.

import io
import json
import math
import threading
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import rclpy
from geometry_msgs.msg import Twist
from nav_msgs.msg import Odometry, OccupancyGrid, Path
from rclpy.node import Node
from sensor_msgs.msg import CompressedImage, JointState, LaserScan
from std_msgs.msg import Float32, String
from tf2_msgs.msg import TFMessage

# arm_msgs vient du workspace Yahboom (/root/yahboomcar_ws). Import optionnel
# pour que le bridge demarre meme si le workspace Yahboom n'est pas source.
# Sans arm_msgs, la commande cmd/arm sera juste loggee + ignoree.
try:
    from arm_msgs.msg import ArmJoints
    HAS_ARM_MSGS = True
except ImportError:
    ArmJoints = None
    HAS_ARM_MSGS = False
from visualization_msgs.msg import MarkerArray


# --- utilities (testables hors ROS) ---

def occupancy_to_png(width: int, height: int, data) -> bytes:
    """OccupancyGrid (-1 unknown, 0 free, 100 occupied) -> PNG niveaux gris.
    Convention SLAM PGM : 205 gris (unknown), 254 blanc (free), 0 noir (occupied).
    Y-flip car PIL origin = top-left, SLAM = bottom-left.
    """
    from PIL import Image
    arr = bytearray(width * height)
    for i, v in enumerate(data):
        if v < 0:
            arr[i] = 205
        elif v < 50:
            arr[i] = 254
        else:
            arr[i] = 0
    img = Image.frombytes('L', (width, height), bytes(arr))
    img = img.transpose(Image.FLIP_TOP_BOTTOM)
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue()


class TeleopDeadman:
    """Reset timer a chaque feed(). Si expiry sans feed -> publish_zero().
    Evite runaway si onglet web ferme brutalement ou cle clavier stuck."""

    def __init__(self, publish_zero, timeout_s: float = 0.5):
        self.publish_zero = publish_zero
        self.timeout_s = timeout_s
        self._timer = None
        self._lock = threading.Lock()

    def feed(self, lin: float, ang: float):
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(self.timeout_s, self.publish_zero)
            self._timer.daemon = True
            self._timer.start()

    def stop(self):
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None

SCHEMA_VERSION = 1

# Throttle position : on republie au max a cette frequence (le bridge MQTT
# n'a pas besoin de toute la donnee odom haute-frequence pour l'UI web).
POSITION_PUBLISH_PERIOD_S = 1.0

# Batterie Li-Ion 3S du ROSMASTER M3 PRO : ~10.0 V vide, ~12.6 V plein
BATTERY_EMPTY_V = 10.0
BATTERY_FULL_V = 12.6



# Commande MQTT (suffixe topic cmd/<action>) -> topic ROS 2 publie vers le graphe
CMD_TO_ROS_TOPIC = {
    'mission': 'mqtt/mission',
    'cancel': 'mqtt/cancel',
    'resume': 'mqtt/resume',
    'loading-confirmed': 'mqtt/loading_confirmed',
    'emergency-stop': 'mqtt/emergency_stop',
}

# Throttle pour les flux mapping haut-debit (scan, tf) — pas besoin de plus en UI
SCAN_PUBLISH_PERIOD_S = 0.2   # 5 Hz max
TF_PUBLISH_PERIOD_S = 0.2     # 5 Hz max
CAMERA_PUBLISH_PERIOD_S = 0.2   # 5 Hz max — bande passante
JOINT_STATES_PUBLISH_PERIOD_S = 0.1  # 10 Hz max — fluidite visu bras

# Clamp teleop (double securite par-dessus le clamp backend)
TELEOP_MAX_LIN = 0.5  # m/s
TELEOP_MAX_ANG = 1.0  # rad/s


def now_iso() -> str:
    """Horodatage ISO-8601 UTC pour l'enveloppe des messages."""
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def build_joint_states_payload(names, positions) -> dict:
    """Compose le payload JSON pour telemetry/joint_states. Pur, testable."""
    return {
        'schemaVersion': SCHEMA_VERSION,
        'messageId': str(uuid.uuid4()),
        'timestamp': now_iso(),
        'names': list(names),
        'positions': list(positions),
    }


# Limites pour cmd/arm (securite avant que le msg ROS atteigne YB_Node).
# Doc officielle Yahboom M3 Pro : tous les joints sont 0..180 (unsigned),
# 90 = neutre. Voir armController.ts pour le mapping des roles.
# time < 500 ms = saccade, > 5000 ms = bloque selon constructeur.
ARM_JOINT_MIN = 0
ARM_JOINT_MAX = 180
ARM_TIME_MIN_MS = 500
ARM_TIME_MAX_MS = 5000


def validate_arm_command(body: dict) -> tuple:
    """Renvoie (joints[6], time_ms) si valide, sinon leve ValueError.
    Pur, testable. Les valeurs sont clampees aux limites de securite."""
    keys = ('joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6')
    joints = []
    for k in keys:
        if k not in body:
            raise ValueError(f'champ manquant: {k}')
        v = body[k]
        if not isinstance(v, (int, float)):
            raise ValueError(f'{k} doit etre numerique')
        # clamp
        v = max(ARM_JOINT_MIN, min(ARM_JOINT_MAX, int(v)))
        joints.append(v)
    time_ms = body.get('time', 500)
    if not isinstance(time_ms, (int, float)):
        raise ValueError('time doit etre numerique')
    time_ms = max(ARM_TIME_MIN_MS, min(ARM_TIME_MAX_MS, int(time_ms)))
    return joints, time_ms


class MqttBridge(Node):
    def __init__(self):
        super().__init__('mqtt_bridge')

        # --- Parametres ROS 2 (jamais de hardcoding) ---
        self.declare_parameter('broker_host', 'localhost')
        self.declare_parameter('broker_port', 1883)
        self.declare_parameter('robot_id', 1)
        self.declare_parameter('mqtt_user', '')
        self.declare_parameter('mqtt_password', '')

        self.robot_id = self.get_parameter('robot_id').value
        host = self.get_parameter('broker_host').value
        port = self.get_parameter('broker_port').value
        self.base = f'roblaude/{self.robot_id}'

        # --- Publishers ROS 2 : commande MQTT -> graphe ROS ---
        # Le mission_executor (T3.2.5) s'abonnera a ces topics.
        self._cmd_pubs = {
            action: self.create_publisher(String, ros_topic, 10)
            for action, ros_topic in CMD_TO_ROS_TOPIC.items()
        }
        # Publisher dedie pour le bras Yahboom (type custom arm_msgs/ArmJoints).
        # YB_Node sub /arm6_joints et applique les angles aux servos.
        if HAS_ARM_MSGS:
            self.arm_pub = self.create_publisher(ArmJoints, '/arm6_joints', 10)
            self.get_logger().info('arm_msgs detecte — cmd/arm activee')
        else:
            self.arm_pub = None
            self.get_logger().warn(
                'arm_msgs absent (source /root/yahboomcar_ws/install/setup.bash) — cmd/arm ignoree'
            )

        # --- Subscribers ROS 2 : graphe ROS -> telemetrie/mission MQTT ---
        # Position : /odom (nav_msgs/Odometry) — toujours dispo des que base_bringup
        # tourne. Plus tard on pourra basculer sur /amcl_pose (plus precis avec
        # carte chargee) en gardant /odom en fallback.
        self._last_position_publish = 0.0
        self.create_subscription(Odometry, '/odom', self._on_odom, 10)
        # Batterie : /battery est le topic Yahboom standard (YB_Node), Float32
        # = tension en volts. On en deduit le pourcentage cote bridge.
        self.create_subscription(Float32, '/battery', self._on_battery, 10)
        # Status : pas de topic Yahboom natif — sera publie par mission_executor
        # (#59) quand il sera la. En attendant le bridge publie AVAILABLE au
        # demarrage (cf. _on_mqtt_connect).
        self.create_subscription(String, 'robot/status', self._on_status, 10)
        self.create_subscription(String, 'mission/ack', self._on_mission_ack, 10)
        self.create_subscription(String, 'mission/status', self._on_mission_status, 10)
        self.create_subscription(String, 'mission/result', self._on_mission_result, 10)

        # --- Mode mapping (T3.5.3) : flux temps reel SLAM/Nav2 -> MQTT ---
        # Cache TF (les TFMessage donnent des updates partiels, on accumule)
        self._tf_buffer = {}
        self._last_scan_publish = 0.0
        self._last_tf_publish = 0.0
        self._last_camera_publish = 0.0
        self._last_joint_states_publish = 0.0
        self.create_subscription(OccupancyGrid, '/map', self._on_map, 10)
        self.create_subscription(LaserScan, '/scan_multi', self._on_scan, 10)
        self.create_subscription(Path, '/plan', self._on_plan, 10)
        self.create_subscription(MarkerArray, '/explore/frontiers', self._on_frontiers, 10)
        self.create_subscription(TFMessage, '/tf', self._on_tf, 10)
        # Camera + joint_states (T-final UI live)
        # Topics ROS configurables — le Yahboom M3 Pro peut publier sous
        # /usb_cam/image_raw/compressed ou /camera/color/image_raw/compressed.
        self.declare_parameter('camera_topic', '/camera/color/image_raw/compressed')
        self.declare_parameter('joint_states_topic', '/joint_states')
        camera_topic = self.get_parameter('camera_topic').value
        joint_states_topic = self.get_parameter('joint_states_topic').value
        self.create_subscription(CompressedImage, camera_topic, self._on_camera, 5)
        self.create_subscription(JointState, joint_states_topic, self._on_joint_states, 10)
        # Bridge vers les nodes RobLaude (mission_executor / mapping_supervisor)
        self.create_subscription(String, '/mqtt/mapping/state', self._on_mapping_state, 10)
        self.create_subscription(String, '/mqtt/mapping/save_result', self._on_save_result, 10)

        # --- Publishers vers le graphe ROS (commandes MQTT -> ROS) ---
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.mapping_cmd_pub = self.create_publisher(String, '/mqtt/cmd/mapping', 10)

        # Dead-man teleop : si pas de cmd recu pendant 500ms, on stoppe le robot
        self.teleop_deadman = TeleopDeadman(
            publish_zero=lambda: self.cmd_vel_pub.publish(Twist()),
            timeout_s=0.5,
        )

        # --- Client MQTT ---
        # clean_session=False : le broker met en file les commandes recues
        # pendant une courte deconnexion et les delivre a la reconnexion.
        self.mqtt = mqtt.Client(
            client_id=f'robot-{self.robot_id}',
            clean_session=False,
            protocol=mqtt.MQTTv311,
        )
        user = self.get_parameter('mqtt_user').value
        if user:
            self.mqtt.username_pw_set(user, self.get_parameter('mqtt_password').value)

        # Last Will : si le robot tombe, le broker annonce online:false (retained)
        self.mqtt.will_set(
            f'{self.base}/connection',
            json.dumps({'schemaVersion': SCHEMA_VERSION,
                        'timestamp': now_iso(), 'online': False}),
            qos=1, retain=True,
        )
        self.mqtt.on_connect = self._on_mqtt_connect
        self.mqtt.on_message = self._on_mqtt_message
        self.mqtt.on_disconnect = self._on_mqtt_disconnect

        # Reconnexion automatique geree par la boucle paho
        self.mqtt.reconnect_delay_set(min_delay=1, max_delay=30)
        # keepalive court : coupure brutale detectee en ~15 s via le LWT
        self.mqtt.connect_async(host, port, keepalive=10)
        self.mqtt.loop_start()
        self.get_logger().info(f'Bridge MQTT demarre — broker {host}:{port}, '
                               f'robot_id={self.robot_id}')

    # ---------- Callbacks MQTT ----------

    def _on_mqtt_connect(self, client, _userdata, _flags, rc):
        if rc != 0:
            self.get_logger().error(f'Connexion broker refusee (rc={rc})')
            return
        # Abonnement aux commandes de CE robot uniquement
        client.subscribe(f'{self.base}/cmd/#', qos=2)
        # Annonce de presence (retained)
        client.publish(
            f'{self.base}/connection',
            json.dumps({'schemaVersion': SCHEMA_VERSION,
                        'timestamp': now_iso(), 'online': True}),
            qos=1, retain=True,
        )
        # Etat initial : AVAILABLE (retained). Le mission_executor (#59)
        # ecrasera cette valeur quand une mission demarre / se termine.
        client.publish(
            f'{self.base}/status',
            json.dumps({'schemaVersion': SCHEMA_VERSION,
                        'timestamp': now_iso(), 'state': 'AVAILABLE'}),
            qos=1, retain=True,
        )
        self.get_logger().info('Connecte au broker, abonne a cmd/#')

    def _on_mqtt_disconnect(self, _client, _userdata, rc):
        self.get_logger().warn(f'Deconnecte du broker (rc={rc}) — reconnexion…')

    def _on_mqtt_message(self, _client, _userdata, msg):
        """MQTT cmd/<action> -> graphe ROS. Message malforme : log + ignore."""
        try:
            payload = json.loads(msg.payload)
        except json.JSONDecodeError as err:
            self.get_logger().warn(f'Message rejete sur {msg.topic} : JSON invalide ({err})')
            return
        if not isinstance(payload, dict):
            self.get_logger().warn(f'Message rejete sur {msg.topic} : payload non-objet')
            return
        if payload.get('schemaVersion') != SCHEMA_VERSION:
            self.get_logger().warn(
                f'Message rejete sur {msg.topic} : schemaVersion inconnue')
            return

        # topic = roblaude/{id}/cmd/{action} ou cmd/mapping/{start|stop|save}
        # On extrait la partie apres /cmd/
        try:
            after_cmd = msg.topic.split('/cmd/', 1)[1]
        except IndexError:
            return

        # Cas 1 : cmd/teleop (haut-debit, 20Hz) -> /cmd_vel direct, pas via topic intermediate
        if after_cmd == 'teleop':
            try:
                lin = float(payload.get('lin', 0))
                ang = float(payload.get('ang', 0))
            except (ValueError, TypeError):
                return
            if not math.isfinite(lin) or not math.isfinite(ang):
                return
            # Clamp dur en plus du clamp backend
            cLin = max(-TELEOP_MAX_LIN, min(TELEOP_MAX_LIN, lin))
            cAng = max(-TELEOP_MAX_ANG, min(TELEOP_MAX_ANG, ang))
            twist = Twist()
            twist.linear.x = cLin
            twist.angular.z = cAng
            self.cmd_vel_pub.publish(twist)
            self.teleop_deadman.feed(cLin, cAng)
            return

        # Cas 1.5 : cmd/arm -> /arm6_joints (arm_msgs/ArmJoints, type Yahboom)
        if after_cmd == 'arm':
            if self.arm_pub is None:
                self.get_logger().warn('cmd/arm recu mais arm_msgs absent — ignore')
                return
            try:
                joints, time_ms = validate_arm_command(payload)
            except ValueError as e:
                self.get_logger().warn(f'cmd/arm rejete : {e}')
                return
            msg_arm = ArmJoints()
            msg_arm.joint1 = joints[0]
            msg_arm.joint2 = joints[1]
            msg_arm.joint3 = joints[2]
            msg_arm.joint4 = joints[3]
            msg_arm.joint5 = joints[4]
            msg_arm.joint6 = joints[5]
            msg_arm.time = time_ms
            self.arm_pub.publish(msg_arm)
            self.get_logger().info(
                f'cmd/arm -> joints={joints} time={time_ms}ms'
            )
            return

        # Cas 2 : cmd/mapping/{start,stop,save} -> /mqtt/cmd/mapping (consomme par supervisor)
        if after_cmd.startswith('mapping/'):
            action = after_cmd.split('/', 1)[1]  # start | stop | save
            ros_payload = String(data=json.dumps({'action': action, **payload}))
            self.mapping_cmd_pub.publish(ros_payload)
            self.get_logger().info(f"mapping/{action} transmis au supervisor")
            return

        # Cas 3 : autres cmd/* (mission, cancel, etc.) -> dispatch via map existante
        pub = self._cmd_pubs.get(after_cmd)
        if pub is None:
            self.get_logger().warn(f'Commande inconnue : {after_cmd}')
            return
        pub.publish(String(data=json.dumps(payload)))
        self.get_logger().info(f"Commande '{after_cmd}' transmise au graphe ROS")

    # ---------- Callbacks ROS 2 -> MQTT ----------

    def _publish(self, topic: str, payload: dict, qos: int, retain: bool):
        """Complete l'enveloppe et publie sur roblaude/{robotId}/<topic>."""
        payload.setdefault('schemaVersion', SCHEMA_VERSION)
        payload.setdefault('timestamp', now_iso())
        self.mqtt.publish(f'{self.base}/{topic}', json.dumps(payload),
                          qos=qos, retain=retain)

    def _forward_json(self, msg, mqtt_topic: str, qos: int, retain: bool):
        """ROS String JSON -> MQTT. Payload illisible ou non-objet : log + ignore.
        Sans ca un publisher ROS bavard suffit a casser un callback en boucle."""
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError as err:
            self.get_logger().warn(
                f'{mqtt_topic} : JSON ROS invalide ignore ({err})')
            return
        if not isinstance(payload, dict):
            self.get_logger().warn(f'{mqtt_topic} : payload ROS non-objet ignore')
            return
        self._publish(mqtt_topic, payload, qos=qos, retain=retain)

    # Les QoS et le flag retain sont definis dans docs/mqtt-spec.md.
    def _on_odom(self, msg):            # T4.1.3 — Odometry (nav_msgs) -> telemetry/position
        # Throttle : /odom publie a 50-100 Hz cote bringup, l'UI web n'en a
        # pas besoin a cette frequence (1 Hz suffit pour suivre le robot).
        now = time.monotonic()
        if now - self._last_position_publish < POSITION_PUBLISH_PERIOD_S:
            return
        self._last_position_publish = now

        # Quaternion (geometry_msgs) -> yaw (theta) — formule classique ZYX.
        q = msg.pose.pose.orientation
        siny_cosp = 2.0 * (q.w * q.z + q.x * q.y)
        cosy_cosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z)
        theta = math.atan2(siny_cosp, cosy_cosp)

        self._publish('telemetry/position', {
            'x': round(msg.pose.pose.position.x, 3),
            'y': round(msg.pose.pose.position.y, 3),
            'theta': round(theta, 3),
            'frame': msg.header.frame_id or 'odom',
        }, qos=0, retain=True)

    def _on_battery(self, msg):         # T4.1.10 — /battery (Float32) = tension Yahboom
        voltage = float(msg.data)
        # interpolation lineaire — approximative, suffisante pour un % indicatif
        ratio = (voltage - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V)
        percent = max(0, min(100, int(ratio * 100)))
        self._publish('telemetry/battery', {
            'voltage': round(voltage, 2),
            'percent': percent,
            'charging': False,  # Yahboom n'expose pas l'etat de charge
        }, qos=1, retain=True)

    def _on_status(self, msg):          # T4.1.11
        self._forward_json(msg, 'status', qos=1, retain=True)

    def _on_mission_ack(self, msg):     # T4.1.4
        self._forward_json(msg, 'mission/ack', qos=1, retain=False)

    def _on_mission_status(self, msg):  # T4.1.4
        self._forward_json(msg, 'mission/status', qos=1, retain=True)

    def _on_mission_result(self, msg):  # T4.1.5
        self._forward_json(msg, 'mission/result', qos=2, retain=False)

    # ---------- T3.5.3 — Flux mapping ROS -> MQTT ----------

    def _on_map(self, msg):
        """OccupancyGrid -> PNG binary retained sur telemetry/map + meta JSON
        compagnon sur telemetry/map_meta (MQTT v3 sans user-properties)."""
        try:
            png = occupancy_to_png(msg.info.width, msg.info.height, list(msg.data))
        except Exception as e:
            self.get_logger().error(f'PNG conversion echec: {e}')
            return
        self.mqtt.publish(f'{self.base}/telemetry/map', png, qos=1, retain=True)
        meta = json.dumps({
            'schemaVersion': SCHEMA_VERSION,
            'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(),
            'width': msg.info.width,
            'height': msg.info.height,
            'resolution': msg.info.resolution,
            'originX': msg.info.origin.position.x,
            'originY': msg.info.origin.position.y,
            'stamp': msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9,
        })
        self.mqtt.publish(f'{self.base}/telemetry/map_meta', meta, qos=1, retain=True)

    def _on_scan(self, msg):
        """LaserScan (haut-debit) throttle 5Hz -> telemetry/scan JSON."""
        now = time.monotonic()
        if now - self._last_scan_publish < SCAN_PUBLISH_PERIOD_S:
            return
        self._last_scan_publish = now
        payload = {
            'schemaVersion': SCHEMA_VERSION,
            'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(),
            'ranges': [float(r) for r in msg.ranges],
            'angleMin': msg.angle_min,
            'angleIncrement': msg.angle_increment,
            'frameId': msg.header.frame_id,
        }
        self.mqtt.publish(f'{self.base}/telemetry/scan',
                          json.dumps(payload), qos=0, retain=False)

    def _on_plan(self, msg):
        """Path Nav2 -> telemetry/plan JSON."""
        poses = [
            {'x': p.pose.position.x, 'y': p.pose.position.y, 'theta': 0.0}
            for p in msg.poses
        ]
        payload = {
            'schemaVersion': SCHEMA_VERSION, 'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(), 'poses': poses,
        }
        self.mqtt.publish(f'{self.base}/telemetry/plan',
                          json.dumps(payload), qos=0, retain=False)

    def _on_frontiers(self, msg):
        """explore_lite frontieres -> telemetry/frontiers JSON."""
        cells = [
            {'x': m.pose.position.x, 'y': m.pose.position.y, 'size': m.scale.x}
            for m in msg.markers
        ]
        payload = {
            'schemaVersion': SCHEMA_VERSION, 'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(), 'cells': cells,
        }
        self.mqtt.publish(f'{self.base}/telemetry/frontiers',
                          json.dumps(payload), qos=0, retain=False)

    def _on_tf(self, msg):
        """TFMessage (updates partiels) -> cache + snapshot complet @5Hz."""
        for t in msg.transforms:
            self._tf_buffer[(t.header.frame_id, t.child_frame_id)] = t

        now = time.monotonic()
        if now - self._last_tf_publish < TF_PUBLISH_PERIOD_S:
            return
        self._last_tf_publish = now

        frames = []
        for (parent, child), t in self._tf_buffer.items():
            tr = t.transform.translation
            r = t.transform.rotation
            frames.append({
                'id': child, 'parent': parent,
                'x': tr.x, 'y': tr.y, 'z': tr.z,
                'qx': r.x, 'qy': r.y, 'qz': r.z, 'qw': r.w,
            })
        payload = {
            'schemaVersion': SCHEMA_VERSION, 'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(), 'frames': frames,
        }
        self.mqtt.publish(f'{self.base}/telemetry/tf',
                          json.dumps(payload), qos=0, retain=False)

    def _on_camera(self, msg):
        """CompressedImage (JPEG) -> binary retained sur telemetry/camera.
        Throttle 5Hz : le frontend redessine au max a cette frequence."""
        now = time.monotonic()
        if now - self._last_camera_publish < CAMERA_PUBLISH_PERIOD_S:
            return
        self._last_camera_publish = now
        # msg.data est un array.array('B', ...) en JPEG deja compresse.
        # On publie tel quel (pas d'envelope JSON — c'est du binary pur).
        # retain=True pour qu'un client qui se connecte voit le dernier frame.
        try:
            self.mqtt.publish(f'{self.base}/telemetry/camera',
                              bytes(msg.data), qos=0, retain=True)
        except Exception as e:
            self.get_logger().warn(f'publish camera echec: {e}')

    def _on_joint_states(self, msg):
        """JointState -> JSON telemetry/joint_states. Throttle 10Hz."""
        now = time.monotonic()
        if now - self._last_joint_states_publish < JOINT_STATES_PUBLISH_PERIOD_S:
            return
        self._last_joint_states_publish = now
        # le frontend Three.js attend positions[] dans l'ordre :
        # base, shoulder, elbow, wrist1, wrist2. Le hardware Yahboom M3 Pro
        # peut publier dans un autre ordre — on garde les names en parallele
        # pour que le front puisse reordonner si besoin.
        payload = build_joint_states_payload(msg.name, msg.position)
        self.mqtt.publish(f'{self.base}/telemetry/joint_states',
                          json.dumps(payload), qos=0, retain=False)

    def _on_mapping_state(self, msg):
        """Passthrough du supervisor : retained sur mapping/state."""
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        payload = json.dumps({
            'schemaVersion': SCHEMA_VERSION, 'messageId': str(uuid.uuid4()),
            'timestamp': now_iso(), **data,
        })
        self.mqtt.publish(f'{self.base}/mapping/state', payload, qos=1, retain=True)

    def _on_save_result(self, msg):
        """Passthrough save_result du supervisor : QoS 2 one-shot."""
        try:
            data = json.loads(msg.data)
        except json.JSONDecodeError:
            return
        payload = json.dumps({
            'schemaVersion': SCHEMA_VERSION,
            'timestamp': now_iso(), **data,
        })
        self.mqtt.publish(f'{self.base}/mapping/save-result',
                          payload, qos=2, retain=False)

    # ---------- Arret ----------

    def stop(self):
        """Arret propre : annonce offline (retained) puis ferme la connexion.
        Sans ca, seul le Last Will gere la presence — et il ne se declenche
        pas sur un arret volontaire."""
        info = self.mqtt.publish(
            f'{self.base}/connection',
            json.dumps({'schemaVersion': SCHEMA_VERSION,
                        'timestamp': now_iso(), 'online': False}),
            qos=1, retain=True,
        )
        # sans flush, loop_stop() peut couper avant que offline parte
        try:
            info.wait_for_publish(timeout=2.0)
        except (RuntimeError, ValueError):
            # broker deja injoignable : le LWT prendra le relais
            pass
        self.mqtt.disconnect()
        self.mqtt.loop_stop()


def main(args=None):
    rclpy.init(args=args)
    node = MqttBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.stop()
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()

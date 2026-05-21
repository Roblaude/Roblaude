#!/usr/bin/env python3
# Noeud pont MQTT <-> ROS 2 : seul point d'entree des commandes externes.
# Topics et formats des messages : voir docs/mqtt-spec.md
#
# Squelette (ticket T4.1.1) : la connexion au broker, le Last Will et le
# routage des topics sont fonctionnels. Le cablage vers le graphe ROS utilise
# std_msgs/String en attendant les vrais messages : il faudra les brancher
# une fois le mission_executor (T3.2.5) et la publication de position (T3.2.8)
# disponibles.

import json
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import rclpy
from rclpy.node import Node
from std_msgs.msg import Float32, String

SCHEMA_VERSION = 1

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


def now_iso() -> str:
    """Horodatage ISO-8601 UTC pour l'enveloppe des messages."""
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


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

        # --- Subscribers ROS 2 : graphe ROS -> telemetrie/mission MQTT ---
        # Position : encore placeholder, sera branchee sur /odom ou /amcl_pose
        # quand T3.2.8 (publication position) sera prete.
        self.create_subscription(String, 'robot/position', self._on_position, 10)
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
            if payload.get('schemaVersion') != SCHEMA_VERSION:
                raise ValueError('schemaVersion inconnue')
        except (json.JSONDecodeError, ValueError) as err:
            self.get_logger().warn(f'Message rejete sur {msg.topic} : {err}')
            return

        action = msg.topic.rsplit('/', 1)[-1]  # …/cmd/<action>
        pub = self._cmd_pubs.get(action)
        if pub is None:
            self.get_logger().warn(f'Commande inconnue : {action}')
            return
        pub.publish(String(data=json.dumps(payload)))
        self.get_logger().info(f"Commande '{action}' transmise au graphe ROS")

    # ---------- Callbacks ROS 2 -> MQTT ----------

    def _publish(self, topic: str, payload: dict, qos: int, retain: bool):
        """Complete l'enveloppe et publie sur roblaude/{robotId}/<topic>."""
        payload.setdefault('schemaVersion', SCHEMA_VERSION)
        payload.setdefault('timestamp', now_iso())
        self.mqtt.publish(f'{self.base}/{topic}', json.dumps(payload),
                          qos=qos, retain=retain)

    # Les QoS et le flag retain sont definis dans docs/mqtt-spec.md.
    def _on_position(self, msg):        # T4.1.3
        self._publish('telemetry/position', json.loads(msg.data), qos=0, retain=True)

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
        self._publish('status', json.loads(msg.data), qos=1, retain=True)

    def _on_mission_ack(self, msg):     # T4.1.4
        self._publish('mission/ack', json.loads(msg.data), qos=1, retain=False)

    def _on_mission_status(self, msg):  # T4.1.4
        self._publish('mission/status', json.loads(msg.data), qos=1, retain=True)

    def _on_mission_result(self, msg):  # T4.1.5
        self._publish('mission/result', json.loads(msg.data), qos=2, retain=False)

    # ---------- Arret ----------

    def stop(self):
        """Arret propre : annonce offline (retained) puis ferme la connexion.
        Sans ca, seul le Last Will gere la presence — et il ne se declenche
        pas sur un arret volontaire."""
        self.mqtt.publish(
            f'{self.base}/connection',
            json.dumps({'schemaVersion': SCHEMA_VERSION,
                        'timestamp': now_iso(), 'online': False}),
            qos=1, retain=True,
        )
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

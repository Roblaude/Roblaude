# Spécification MQTT — RobLaude

> Contrat de communication entre le **backend Node.js** et le **robot ROS 2**.
> C'est la référence unique pour le Sprint 4. Tout code MQTT (backend, bridge
> robot) doit s'y conformer. Toute évolution passe par une mise à jour de ce
> document **avant** le code.
>
> Statut : spec validée — Sprint 4 « Communication MQTT ».
> Remplace le tableau de topics simplifié de `architecture.md` § « Backend ↔ Robot ».

---

## 1. Objectif et principes

Le broker MQTT (Mosquitto) est le **seul canal** entre le monde web et le robot.
Aucun composant web ne parle ROS 2 directement ; aucun nœud ROS 2 n'expose de
port entrant. Robot et backend se connectent **en sortie** vers le broker.

Principes de conception :

1. **Découplage par robot** — chaque robot a son propre sous-arbre de topics
   `roblaude/{robotId}/…`. Permet le multi-robot, les ACL par robot et le
   fan-out (plusieurs dashboards abonnés à `roblaude/+/telemetry/position`).
2. **Le backend est l'autorité** — il détient la BDD, l'auth, l'état des
   missions. Le frontend ne touche jamais MQTT : il passe par le backend
   (REST + WebSocket).
3. **Séparation commande / télémétrie / cycle de mission** — trois familles de
   topics nettes, avec des QoS adaptés.
4. **État vs événement** — un *état* (position, statut, étape de mission) est
   publié en `retained` : un nouvel abonné connaît immédiatement la situation.
   Un *événement* (ordre, accusé, résultat) n'est jamais `retained` (un ordre
   « démarrer mission » rejoué à chaque reconnexion serait catastrophique).
5. **Enveloppe JSON commune** — tout message partage un en-tête (§ 4) pour la
   traçabilité et la compatibilité ascendante (`schemaVersion`).

---

## 2. Conventions de nommage

Racine du projet : `roblaude/`
Sous-arbre par robot : `roblaude/{robotId}/…`

`{robotId}` = identifiant entier du robot en base (`Robot.id`). Le robot le
reçoit via le paramètre ROS 2 `robot_id` ; le backend le connaît par la BDD.

Familles :

| Préfixe | Sens | Direction |
|---|---|---|
| `roblaude/{robotId}/cmd/…` | Commandes | Backend → Robot |
| `roblaude/{robotId}/telemetry/…` | Flux capteurs continu | Robot → Backend |
| `roblaude/{robotId}/mission/…` | Cycle de vie d'une mission | Robot → Backend |
| `roblaude/{robotId}/status` | État global du robot | Robot → Backend |
| `roblaude/{robotId}/connection` | Présence (LWT) | Robot → Backend |

---

## 3. Arborescence complète des topics

```
roblaude/
└── {robotId}/
    ├── cmd/                       Backend → Robot
    │   ├── mission                démarrer une mission           QoS 2  retained:non
    │   ├── cancel                 annuler la mission courante     QoS 2  retained:non
    │   ├── resume                 reprendre après pause           QoS 2  retained:non
    │   ├── loading-confirmed       le PMR a chargé/déchargé        QoS 2  retained:non
    │   └── emergency-stop          arrêt d'urgence                 QoS 2  retained:non
    ├── telemetry/                 Robot → Backend (flux continu)
    │   ├── position               x, y, theta dans le repère map   QoS 0  retained:oui
    │   └── battery                niveau batterie                  QoS 1  retained:oui
    ├── status                     état robot AVAILABLE|BUSY|…      QoS 1  retained:oui
    ├── mission/                   Robot → Backend (cycle mission)
    │   ├── ack                    accepted | rejected              QoS 1  retained:non
    │   ├── status                 sous-état (NAV_TO_PICKUP…)       QoS 1  retained:oui
    │   └── result                 completed | failed | cancelled   QoS 2  retained:non
    └── connection                 présence — LWT                   QoS 1  retained:oui
```

### Tableau récapitulatif

| Topic | Direction | QoS | Retained | Description |
|---|---|---|---|---|
| `roblaude/{id}/cmd/mission` | Back → Robot | 2 | non | Ordre de démarrage de mission |
| `roblaude/{id}/cmd/cancel` | Back → Robot | 2 | non | Annulation de la mission en cours |
| `roblaude/{id}/cmd/resume` | Back → Robot | 2 | non | Reprise après une pause |
| `roblaude/{id}/cmd/loading-confirmed` | Back → Robot | 2 | non | Le PMR confirme chargement/déchargement |
| `roblaude/{id}/cmd/emergency-stop` | Back → Robot | 2 | non | Arrêt d'urgence — priorité maximale |
| `roblaude/{id}/telemetry/position` | Robot → Back | 0 | oui | Position en continu (~5–10 Hz) |
| `roblaude/{id}/telemetry/battery` | Robot → Back | 1 | oui | Niveau de batterie |
| `roblaude/{id}/status` | Robot → Back | 1 | oui | État global du robot |
| `roblaude/{id}/mission/ack` | Robot → Back | 1 | non | Accusé de réception d'un ordre |
| `roblaude/{id}/mission/status` | Robot → Back | 1 | oui | Sous-état de la mission en cours |
| `roblaude/{id}/mission/result` | Robot → Back | 2 | non | Fin de mission |
| `roblaude/{id}/connection` | Robot → Back | 1 | oui | Présence en ligne / hors ligne (LWT) |

**Abonnements de chaque partie :**

- **Robot** (bridge) : `roblaude/{monId}/cmd/#`
- **Backend** : `roblaude/+/telemetry/#`, `roblaude/+/status`,
  `roblaude/+/mission/#`, `roblaude/+/connection`
  (le `+` permet de gérer plusieurs robots sans changer le code)

---

## 4. Enveloppe commune des messages

Tout payload est du **JSON UTF-8** et contient au minimum :

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-05-19T10:00:00.000Z",
  ...
}
```

- `schemaVersion` (int) — version du format. Incrémentée à tout changement
  cassant. Un consommateur qui reçoit une version inconnue **log et ignore**.
- `timestamp` (string ISO-8601 UTC) — date d'émission.
- `messageId` (string UUID v4) — **présent sur les commandes et les messages
  de mission** (cmd/\*, mission/\*). Permet l'idempotence : un consommateur
  qui revoit un `messageId` déjà traité l'ignore. Absent sur la télémétrie
  haute fréquence (on garde le message léger).

Un message malformé (JSON invalide, `schemaVersion` inconnue, champ requis
manquant) est **loggé puis ignoré** — jamais de crash.

---

## 5. Format des messages

### 5.1 Backend → Robot (`cmd/*`)

**`cmd/mission`** — démarrer une mission

```json
{
  "schemaVersion": 1,
  "messageId": "9f1c…",
  "timestamp": "2026-05-19T10:00:00.000Z",
  "missionId": 42,
  "type": "TRANSPORT",
  "fromPoint": { "slug": "accueil",     "x": 1.20, "y": 3.40, "theta": 0.00 },
  "toPoint":   { "slug": "bureau-201",  "x": 8.05, "y": 2.10, "theta": 1.57 },
  "objectId": null
}
```

- `type` : `TRANSPORT` (UC-01) ou `PICK_AND_PLACE` (UC-02).
- `objectId` : `null` pour un transport, l'id de l'objet pour un pick & place.

**`cmd/cancel`**, **`cmd/resume`**, **`cmd/loading-confirmed`** — même forme

```json
{
  "schemaVersion": 1,
  "messageId": "…",
  "timestamp": "…",
  "missionId": 42
}
```

**`cmd/emergency-stop`**

```json
{
  "schemaVersion": 1,
  "messageId": "…",
  "timestamp": "…",
  "reason": "user-pressed-stop"
}
```

Pas de `missionId` : l'arrêt d'urgence stoppe le robot quoi qu'il fasse.

### 5.2 Robot → Backend — télémétrie

**`telemetry/position`** (pas de `messageId` — flux haute fréquence)

```json
{
  "schemaVersion": 1,
  "timestamp": "…",
  "x": 4.21,
  "y": 2.05,
  "theta": 1.57,
  "frame": "map"
}
```

**`telemetry/battery`**

```json
{
  "schemaVersion": 1,
  "timestamp": "…",
  "percent": 78,
  "voltage": 12.4,
  "charging": false
}
```

### 5.3 Robot → Backend — état robot

**`status`**

```json
{
  "schemaVersion": 1,
  "timestamp": "…",
  "state": "BUSY"
}
```

`state` ∈ `AVAILABLE | BUSY | OFFLINE | ERROR` (= enum `RobotStatus` Prisma).

### 5.4 Robot → Backend — cycle de mission

**`mission/ack`** — réponse à un `cmd/mission`

```json
{
  "schemaVersion": 1,
  "messageId": "…",
  "timestamp": "…",
  "missionId": 42,
  "result": "accepted"
}
```

`result` ∈ `accepted | rejected`. Si `rejected`, champ `reason` obligatoire
(ex. `"robot-busy"`, `"unknown-point"`).

**`mission/status`** — progression (publié à chaque changement de sous-état)

```json
{
  "schemaVersion": 1,
  "timestamp": "…",
  "missionId": 42,
  "state": "NAVIGATING_TO_PICKUP",
  "progress": 0.35
}
```

`state` ∈ enum `MissionStatus` Prisma. `progress` ∈ [0, 1], optionnel.

**`mission/result`** — fin de mission

```json
{
  "schemaVersion": 1,
  "messageId": "…",
  "timestamp": "…",
  "missionId": 42,
  "result": "completed"
}
```

`result` ∈ `completed | failed | cancelled`. Si `failed`, champ `reason`
obligatoire (ex. `"navigation-timeout"`, `"obstacle-blocking"`,
`"grasp-failed"`).

### 5.5 Robot → Backend — présence

**`connection`** — publié `retained` par le robot

```json
{ "schemaVersion": 1, "timestamp": "…", "online": true }
```

À la connexion propre, le robot publie `online: true`. Le **Last Will**
configuré sur le broker (§ 6) publie `online: false` automatiquement si la
connexion TCP du robot tombe sans déconnexion propre.

---

## 6. QoS, retained et Last Will

### Choix de QoS

| QoS | Sémantique | Utilisé pour | Pourquoi |
|---|---|---|---|
| 0 | au plus une fois | `telemetry/position` | Haute fréquence ; perdre une frame est sans conséquence, l'état suivant arrive tout de suite. |
| 1 | au moins une fois | `status`, `battery`, `mission/ack`, `mission/status`, `connection` | Doit arriver ; un doublon est inoffensif (état idempotent). |
| 2 | exactement une fois | `cmd/*`, `mission/result` | Ni perte ni doublon : ne jamais rater « démarrer mission » ni la déclencher deux fois. |

### Retained

Les topics d'**état** sont `retained` : `telemetry/position`,
`telemetry/battery`, `status`, `mission/status`, `connection`. Un backend qui
redémarre récupère immédiatement la dernière situation connue sans attendre la
prochaine publication.

Les topics d'**événement** ne sont jamais `retained` : `cmd/*`, `mission/ack`,
`mission/result`. Un événement `retained` serait rejoué à chaque nouvel abonné.

### Last Will & Testament (LWT)

À la connexion, le robot configure son testament :

- topic : `roblaude/{robotId}/connection`
- payload : `{"schemaVersion":1,"timestamp":"…","online":false}`
- QoS 1, `retained: true`

Si le robot disparaît brutalement (coupure WiFi, crash, batterie vide), le
broker publie ce testament. Le backend détecte la perte du robot **en moins
d'une seconde**, sans polling, et passe le robot en `OFFLINE`.

---

## 7. Sécurité — Mosquitto

`mosquitto.conf` actuel (`allow_anonymous true`) est acceptable en dev local
uniquement. Cible Sprint 4 :

```conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

Deux identités : `backend` et `robot-{id}`. ACL (`acl_file`) :

```
# Le backend : lecture/écriture sur tout le projet
user backend
topic readwrite roblaude/#

# Un robot : écrit SOUS son sous-arbre, lit SEULEMENT ses commandes
user robot-1
topic write    roblaude/1/#
topic read     roblaude/1/cmd/#
```

C'est la frontière de sécurité : un robot compromis ne peut ni piloter un
autre robot ni lire la télémétrie d'autrui. (TLS `wss://` repoussé à la prod.)

---

## 8. Squelette du nœud pont — `roblaude_mqtt/mqtt_bridge.py`

Package ROS 2 `roblaude_mqtt`, nœud `mqtt_bridge`. Traduit MQTT ↔ ROS 2 et
constitue le **seul point d'entrée** des commandes externes sur le robot.

```python
#!/usr/bin/env python3
# Nœud pont MQTT <-> ROS 2. Seul point d'entree des commandes externes.
# Conformite : docs/mqtt-spec.md

import json
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import rclpy
from rclpy.node import Node
from std_msgs.msg import String  # placeholder — a remplacer par les vrais msgs

SCHEMA_VERSION = 1


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class MqttBridge(Node):
    def __init__(self):
        super().__init__("mqtt_bridge")

        # --- Parametres ROS 2 (jamais de hardcoding) ---
        self.declare_parameter("broker_host", "localhost")
        self.declare_parameter("broker_port", 1883)
        self.declare_parameter("robot_id", 1)
        self.declare_parameter("mqtt_user", "robot-1")
        self.declare_parameter("mqtt_password", "")

        self.robot_id = self.get_parameter("robot_id").value
        host = self.get_parameter("broker_host").value
        port = self.get_parameter("broker_port").value

        self.base = f"roblaude/{self.robot_id}"

        # --- Publishers ROS 2 : MQTT cmd -> graphe ROS ---
        # Le mission_executor (T3.2.5) s'abonne a ces topics.
        self.pub_mission = self.create_publisher(String, "mqtt/mission", 10)
        self.pub_cancel = self.create_publisher(String, "mqtt/cancel", 10)
        self.pub_resume = self.create_publisher(String, "mqtt/resume", 10)
        self.pub_loading = self.create_publisher(String, "mqtt/loading_confirmed", 10)
        # emergency-stop : QoS RELIABLE cote ROS, jamais ignore
        self.pub_estop = self.create_publisher(String, "mqtt/emergency_stop", 10)

        # --- Subscribers ROS 2 : graphe ROS -> MQTT telemetry/mission ---
        self.create_subscription(String, "robot/position", self._on_position, 10)
        self.create_subscription(String, "robot/battery", self._on_battery, 10)
        self.create_subscription(String, "robot/status", self._on_status, 10)
        self.create_subscription(String, "mission/ack", self._on_mission_ack, 10)
        self.create_subscription(String, "mission/status", self._on_mission_status, 10)
        self.create_subscription(String, "mission/result", self._on_mission_result, 10)

        # --- Client MQTT (T4.1.1) ---
        self.mqtt = mqtt.Client(
            client_id=f"robot-{self.robot_id}", protocol=mqtt.MQTTv311
        )
        user = self.get_parameter("mqtt_user").value
        pwd = self.get_parameter("mqtt_password").value
        if user:
            self.mqtt.username_pw_set(user, pwd)

        # Last Will : si le robot tombe, le broker annonce online:false
        self.mqtt.will_set(
            f"{self.base}/connection",
            json.dumps({"schemaVersion": SCHEMA_VERSION,
                        "timestamp": now_iso(), "online": False}),
            qos=1, retain=True,
        )
        self.mqtt.on_connect = self._on_mqtt_connect
        self.mqtt.on_message = self._on_mqtt_message
        self.mqtt.on_disconnect = self._on_mqtt_disconnect

        # reconnexion auto geree par la boucle paho
        self.mqtt.reconnect_delay_set(min_delay=1, max_delay=30)
        self.mqtt.connect_async(host, port, keepalive=30)
        self.mqtt.loop_start()
        self.get_logger().info(f"Bridge MQTT demarre — broker {host}:{port}")

    # ---------- Callbacks MQTT ----------

    def _on_mqtt_connect(self, client, _u, _f, rc):
        if rc != 0:
            self.get_logger().error(f"Connexion broker refusee (rc={rc})")
            return
        # Abonnement aux commandes de CE robot uniquement (T4.1.2)
        client.subscribe(f"{self.base}/cmd/#", qos=2)
        # Annonce de presence
        client.publish(
            f"{self.base}/connection",
            json.dumps({"schemaVersion": SCHEMA_VERSION,
                        "timestamp": now_iso(), "online": True}),
            qos=1, retain=True,
        )
        self.get_logger().info("Connecte au broker, abonne aux commandes")

    def _on_mqtt_disconnect(self, _c, _u, rc):
        self.get_logger().warn(f"Deconnecte du broker (rc={rc}) — reconnexion…")

    def _on_mqtt_message(self, _c, _u, msg):
        # MQTT cmd -> ROS 2. Un message malforme est logge puis ignore.
        try:
            payload = json.loads(msg.payload)
            if payload.get("schemaVersion") != SCHEMA_VERSION:
                raise ValueError("schemaVersion inconnue")
        except (json.JSONDecodeError, ValueError) as e:
            self.get_logger().warn(f"Message rejete sur {msg.topic} : {e}")
            return

        action = msg.topic.rsplit("/", 1)[-1]   # …/cmd/<action>
        routes = {
            "mission": self.pub_mission,
            "cancel": self.pub_cancel,
            "resume": self.pub_resume,
            "loading-confirmed": self.pub_loading,
            "emergency-stop": self.pub_estop,
        }
        pub = routes.get(action)
        if pub is None:
            self.get_logger().warn(f"Commande inconnue : {action}")
            return
        pub.publish(String(data=json.dumps(payload)))
        self.get_logger().info(f"Commande '{action}' transmise au graphe ROS")

    # ---------- Callbacks ROS 2 -> MQTT ----------

    def _publish(self, topic: str, payload: dict, qos: int, retain: bool):
        payload.setdefault("schemaVersion", SCHEMA_VERSION)
        payload.setdefault("timestamp", now_iso())
        self.mqtt.publish(f"{self.base}/{topic}",
                          json.dumps(payload), qos=qos, retain=retain)

    def _on_position(self, msg):       # T4.1.3
        self._publish("telemetry/position", json.loads(msg.data), qos=0, retain=True)

    def _on_battery(self, msg):
        self._publish("telemetry/battery", json.loads(msg.data), qos=1, retain=True)

    def _on_status(self, msg):
        self._publish("status", json.loads(msg.data), qos=1, retain=True)

    def _on_mission_ack(self, msg):    # T4.1.4
        self._publish("mission/ack", json.loads(msg.data), qos=1, retain=False)

    def _on_mission_status(self, msg):
        self._publish("mission/status", json.loads(msg.data), qos=1, retain=True)

    def _on_mission_result(self, msg):  # T4.1.5
        self._publish("mission/result", json.loads(msg.data), qos=2, retain=False)


def main(args=None):
    rclpy.init(args=args)
    node = MqttBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.mqtt.loop_stop()
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
```

> Les `String` sont des placeholders. Selon le choix d'équipe, on remplacera
> par des messages ROS 2 typés (`geometry_msgs/PoseStamped` pour la position,
> messages custom `roblaude_msgs` pour les missions). À trancher en T4.1.9.

---

## 9. Squelette de l'adaptateur backend — `src/services/mqtt.ts`

Singleton MQTT côté Node.js. Conforme à `architecture.md` § Backend
(« MQTT client : singleton dans `src/services/mqtt.ts` »).

```ts
import mqtt, { type MqttClient } from 'mqtt'
import { randomUUID } from 'node:crypto'

const SCHEMA_VERSION = 1

type CmdAction = 'mission' | 'cancel' | 'resume' | 'loading-confirmed' | 'emergency-stop'

class RobotMqttAdapter {
  private client: MqttClient | null = null

  connect() {
    const url = process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883'
    this.client = mqtt.connect(url, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 2000, // reconnexion auto
    })

    this.client.on('connect', () => {
      // Abonnement a tous les robots (wildcard +)
      this.client!.subscribe([
        'roblaude/+/telemetry/#',
        'roblaude/+/status',
        'roblaude/+/mission/#',
        'roblaude/+/connection',
      ], { qos: 1 })
      console.log('[mqtt] connecte au broker')
    })

    this.client.on('message', (topic, payload) => this.onMessage(topic, payload))
    this.client.on('error', (e) => console.error('[mqtt]', e.message))
  }

  /** Backend -> Robot. Topic : roblaude/{robotId}/cmd/{action} */
  publishCommand(robotId: number, action: CmdAction, body: object) {
    const message = { schemaVersion: SCHEMA_VERSION, messageId: randomUUID(),
                      timestamp: new Date().toISOString(), ...body }
    this.client?.publish(`roblaude/${robotId}/cmd/${action}`,
      JSON.stringify(message), { qos: 2, retain: false })
  }

  /** Robot -> Backend : route vers le bon handler, met a jour BDD + WebSocket */
  private onMessage(topic: string, payload: Buffer) {
    const [, , family, sub] = topic.split('/') // roblaude/{id}/{family}/{sub?}
    let data: Record<string, unknown>
    try {
      data = JSON.parse(payload.toString())
      if (data.schemaVersion !== SCHEMA_VERSION) throw new Error('version')
    } catch {
      console.warn(`[mqtt] message rejete sur ${topic}`)
      return
    }
    // TODO T4.2.3-2.5 : router (telemetry/mission/status/connection),
    // mettre a jour Prisma, relayer aux clients via le singleton WebSocket.
  }
}

export const robotMqtt = new RobotMqttAdapter()
```

---

## 10. Correspondance topics ↔ tickets Sprint 4

| Topic | Robot (publie/recoit) | Backend (recoit/publie) | Frontend |
|---|---|---|---|
| `cmd/mission` | T4.1.2 | T4.2.2 | — |
| `cmd/cancel` | T4.1.2 | T4.2.2 | — |
| `cmd/resume` | T4.1.7 | T4.2.7 | — |
| `cmd/loading-confirmed` | T4.1.8 | T4.2.8 | — |
| `cmd/emergency-stop` | T4.1.6 | T4.2.6 | T4.3.4 |
| `telemetry/position` | T4.1.3 | T4.2.4 | T4.3.2 |
| `telemetry/battery` | T4.1.3 | T4.2.4 | T4.3.2 |
| `status` | T4.1.4 | T4.2.3 | T4.3.3 |
| `mission/ack` | T4.1.4 | T4.2.3 | T4.3.3 |
| `mission/status` | T4.1.4 | T4.2.3 | T4.3.3 |
| `mission/result` | T4.1.5 | T4.2.5 | T4.3.3 |
| `connection` (LWT) | T4.1.1 | T4.2.3 | T4.3.3 |

Le ticket fondateur **T4.1.9** = ce document. Tous les autres en dépendent.

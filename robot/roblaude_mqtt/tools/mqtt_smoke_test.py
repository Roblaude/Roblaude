#!/usr/bin/env python3
"""Smoke test du contrat MQTT RobLaude contre un broker Mosquitto local.

Verifie l'enveloppe des messages, les QoS, le flag retained et le Last Will
definis dans docs/mqtt-spec.md. Ne demande ni ROS 2 ni le robot allume —
juste un broker joignable (le Mosquitto du docker-compose, port 1883).

Prerequis : pip install paho-mqtt

Usage :
    python3 mqtt_smoke_test.py                  # lance tous les checks
    python3 mqtt_smoke_test.py --host 10.0.0.5  # autre broker
    python3 mqtt_smoke_test.py --sim            # mode simulateur robot
"""
import argparse
import json
import sys
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

SCHEMA_VERSION = 1
ROBOT_ID = 1
BASE = f'roblaude/{ROBOT_ID}'


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def envelope(extra: dict, message_id: bool = False) -> dict:
    """Enveloppe commune des messages — docs/mqtt-spec.md section 4."""
    msg = {'schemaVersion': SCHEMA_VERSION, 'timestamp': now_iso()}
    if message_id:
        msg['messageId'] = str(uuid.uuid4())
    msg.update(extra)
    return msg


def wait_for(predicate, timeout: float = 3.0) -> bool:
    """Attend que predicate() soit vrai, au plus timeout secondes."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


class Recorder:
    """Client MQTT qui enregistre tout ce qu'il recoit."""

    def __init__(self, host, port, name):
        self.messages = []  # (topic, payload, qos, retain)
        self.client = mqtt.Client(client_id=name, clean_session=True,
                                  protocol=mqtt.MQTTv311)
        self.client.on_message = self._on_message
        self.client.connect(host, port, keepalive=30)
        self.client.loop_start()
        if not wait_for(self.client.is_connected):
            raise ConnectionError(
                f'Recorder {name} : pas connecte a {host}:{port} apres timeout')

    def _on_message(self, _c, _u, msg):
        try:
            payload = json.loads(msg.payload)
        except json.JSONDecodeError:
            payload = msg.payload
        self.messages.append((msg.topic, payload, msg.qos, msg.retain))

    def subscribe(self, topic, qos=2):
        self.client.subscribe(topic, qos)
        time.sleep(0.3)  # laisse le SUBACK arriver

    def get(self, topic):
        return [m for m in self.messages if m[0] == topic]

    def close(self):
        self.client.loop_stop()
        self.client.disconnect()


def make_publisher(host, port, name):
    c = mqtt.Client(client_id=name, clean_session=True, protocol=mqtt.MQTTv311)
    c.connect(host, port, keepalive=30)
    c.loop_start()
    if not wait_for(c.is_connected):
        raise ConnectionError(
            f'Publisher {name} : pas connecte a {host}:{port} apres timeout')
    return c


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def run_checks(host, port):
    results = []  # (libelle, ok, detail)

    rec = Recorder(host, port, 'smoke-rec')
    rec.subscribe('roblaude/#', qos=2)
    pub = make_publisher(host, port, 'smoke-pub')

    # 1 — Connexion
    results.append(('Connexion au broker', pub.is_connected(), f'{host}:{port}'))

    # 2 — Enveloppe : une commande bien formee fait l'aller-retour intacte
    sent = envelope({'missionId': 42, 'type': 'TRANSPORT'}, message_id=True)
    pub.publish(f'{BASE}/cmd/mission', json.dumps(sent), qos=2)
    ok = wait_for(lambda: bool(rec.get(f'{BASE}/cmd/mission')))
    detail = 'message non recu'
    if ok:
        payload = rec.get(f'{BASE}/cmd/mission')[-1][1]
        missing = {'schemaVersion', 'timestamp', 'messageId'} - set(payload)
        ok = not missing and payload.get('schemaVersion') == SCHEMA_VERSION
        detail = f'champs manquants : {missing}' if missing else 'enveloppe complete'
    results.append(('Enveloppe cmd/mission (schemaVersion, timestamp, messageId)',
                    ok, detail))

    # 3 — QoS 0 / 1 / 2 : livraison a chaque niveau
    cases = [
        (0, f'{BASE}/telemetry/position', envelope({'x': 1.0, 'y': 2.0})),
        (1, f'{BASE}/mission/ack', envelope({'missionId': 42, 'result': 'accepted'},
                                            message_id=True)),
        (2, f'{BASE}/cmd/emergency-stop', envelope({'reason': 'smoke-test'},
                                                   message_id=True)),
    ]
    for qos, topic, msg in cases:
        before = len(rec.get(topic))
        pub.publish(topic, json.dumps(msg), qos=qos)
        got = wait_for(lambda t=topic, b=before: len(rec.get(t)) > b)
        detail = 'recu' if got else 'non recu'
        results.append((f'Livraison QoS {qos} ({topic.split("/")[-1]})', got, detail))

    # 4 — Wildcard backend : roblaude/+/telemetry/# capte le per-robot
    wild = Recorder(host, port, 'smoke-wild')
    wild.subscribe('roblaude/+/telemetry/#', qos=1)
    pub.publish(f'{BASE}/telemetry/battery',
                json.dumps(envelope({'percent': 78})), qos=1)
    ok = wait_for(lambda: bool(wild.get(f'{BASE}/telemetry/battery')))
    results.append(('Abonnement wildcard roblaude/+/telemetry/#', ok,
                    'capte roblaude/1/telemetry/battery' if ok else 'non capte'))
    wild.close()

    # 5 — Retained : un abonne tardif recoit l'etat, pas les evenements
    pub.publish(f'{BASE}/status', json.dumps(envelope({'state': 'AVAILABLE'})),
                qos=1, retain=True)
    pub.publish(f'{BASE}/mission/result',
                json.dumps(envelope({'missionId': 42, 'result': 'completed'},
                                    message_id=True)), qos=2, retain=False)
    time.sleep(0.4)
    late = Recorder(host, port, 'smoke-late')
    late.subscribe(f'{BASE}/#', qos=2)
    got_state = wait_for(lambda: bool(late.get(f'{BASE}/status')))
    got_event = bool(late.get(f'{BASE}/mission/result'))
    results.append(('Retained : status recu par un abonne tardif', got_state,
                    'recu' if got_state else 'absent'))
    results.append(('Non-retained : mission/result PAS rejoue', not got_event,
                    'absent (correct)' if not got_event else 'rejoue a tort'))
    late.close()

    # 6 — Last Will : coupure brutale -> connection passe online:false
    before = len(rec.get(f'{BASE}/connection'))
    will = mqtt.Client(client_id='smoke-will', clean_session=True,
                       protocol=mqtt.MQTTv311)
    will.will_set(f'{BASE}/connection',
                  json.dumps(envelope({'online': False})), qos=1, retain=True)
    will.connect(host, port, keepalive=5)
    will.loop_start()
    wait_for(will.is_connected)
    will.loop_stop()
    try:
        will.socket().close()  # ferme le TCP sans DISCONNECT -> le broker arme le LWT
    except Exception:
        pass
    got_will = wait_for(
        lambda: any(p.get('online') is False
                    for _, p, _, _ in rec.get(f'{BASE}/connection')[before:]
                    if isinstance(p, dict)),
        timeout=8.0)
    results.append(('Last Will : connection online:false apres coupure', got_will,
                    'LWT declenche' if got_will else 'pas de LWT recu'))

    # Nettoyage des topics retained poses par le test
    for topic in (f'{BASE}/status', f'{BASE}/connection'):
        pub.publish(topic, '', qos=1, retain=True)
    time.sleep(0.3)

    pub.loop_stop()
    pub.disconnect()
    rec.close()
    return results


def run_sim(host, port):
    """Mode simulateur : se comporte comme le robot cote MQTT."""
    client = mqtt.Client(client_id=f'robot-{ROBOT_ID}', clean_session=False,
                         protocol=mqtt.MQTTv311)
    client.will_set(f'{BASE}/connection',
                    json.dumps(envelope({'online': False})), qos=1, retain=True)

    def on_connect(c, _u, _f, rc):
        print(f'[sim] connecte au broker (rc={rc})')
        c.subscribe(f'{BASE}/cmd/#', qos=2)
        c.publish(f'{BASE}/connection',
                  json.dumps(envelope({'online': True})), qos=1, retain=True)

    def on_message(c, _u, msg):
        action = msg.topic.rsplit('/', 1)[-1]
        print(f'[sim] cmd recue : {action} — {msg.payload.decode(errors="replace")}')
        try:
            data = json.loads(msg.payload)
        except json.JSONDecodeError:
            print('[sim] payload illisible, ignore')
            return
        if action == 'mission':
            ack = envelope({'missionId': data.get('missionId'),
                            'result': 'accepted'}, message_id=True)
            c.publish(f'{BASE}/mission/ack', json.dumps(ack), qos=1)
            print('[sim] -> mission/ack accepted')

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(host, port, keepalive=10)
    client.loop_start()

    print(f'[sim] simulateur robot {ROBOT_ID} — Ctrl+C pour arreter')
    try:
        while True:
            client.publish(f'{BASE}/telemetry/position',
                           json.dumps(envelope({'x': 1.2, 'y': 3.4, 'theta': 0.0,
                                                'frame': 'map'})), qos=0, retain=True)
            client.publish(f'{BASE}/telemetry/battery',
                           json.dumps(envelope({'percent': 78, 'voltage': 12.4,
                                                'charging': False})),
                           qos=1, retain=True)
            client.publish(f'{BASE}/status',
                           json.dumps(envelope({'state': 'AVAILABLE'})),
                           qos=1, retain=True)
            time.sleep(2)
    except KeyboardInterrupt:
        client.publish(f'{BASE}/connection',
                       json.dumps(envelope({'online': False})), qos=1, retain=True)
        time.sleep(0.3)
        client.disconnect()
        client.loop_stop()
        print('\n[sim] arrete')


def main():
    parser = argparse.ArgumentParser(description='Smoke test MQTT RobLaude')
    parser.add_argument('--host', default='localhost')
    parser.add_argument('--port', type=int, default=1883)
    parser.add_argument('--sim', action='store_true',
                        help='mode simulateur robot au lieu des checks')
    args = parser.parse_args()

    if args.sim:
        run_sim(args.host, args.port)
        return 0

    print(f'Smoke test MQTT — broker {args.host}:{args.port}\n')
    try:
        results = run_checks(args.host, args.port)
    except (ConnectionRefusedError, OSError) as err:
        print(f'❌ Impossible de joindre le broker : {err}')
        print('   Le Mosquitto du docker-compose tourne-t-il ? (docker compose up -d)')
        return 1

    passed = 0
    for libelle, ok, detail in results:
        mark = '✅ PASS' if ok else '❌ FAIL'
        print(f'  {mark}  {libelle}  —  {detail}')
        passed += ok

    total = len(results)
    print(f'\n{passed}/{total} checks OK')
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())

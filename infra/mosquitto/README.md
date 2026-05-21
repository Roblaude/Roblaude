# Mosquitto — auth + ACL

Le broker refuse les connexions anonymes (`allow_anonymous false`) et isole
chaque robot via un ACL (cf. `docs/mqtt-spec.md` §7).

## Premier setup (une seule fois par dev)

Générer le fichier `passwd` (gitignored) :

```bash
touch infra/mosquitto/passwd

# Backend — broker
docker run --rm -v $(pwd)/infra/mosquitto:/m eclipse-mosquitto:2 \
    mosquitto_passwd -b /m/passwd backend backend-CHANGE-ME

# Robot 1 — broker
docker run --rm -v $(pwd)/infra/mosquitto:/m eclipse-mosquitto:2 \
    mosquitto_passwd -b /m/passwd robot-1 robot1-CHANGE-ME
```

Remplacer `*-CHANGE-ME` par des mots de passe forts. Reporter ces
credentials dans :

- `web/backend/.env` :
  ```
  MQTT_USERNAME=backend
  MQTT_PASSWORD=<backend-CHANGE-ME>
  ```
- Côté robot, dans `mqtt_bridge.yaml` ou via env :
  ```yaml
  mqtt_user: 'robot-1'
  mqtt_password: '<robot1-CHANGE-ME>'
  ```

## Ajouter un robot

Pour chaque nouveau robot, créer un user dédié et étendre l'ACL :

```bash
docker run --rm -v $(pwd)/infra/mosquitto:/m eclipse-mosquitto:2 \
    mosquitto_passwd -b /m/passwd robot-2 robot2-pwd
```

Puis ajouter dans `infra/mosquitto/acl` :

```
user robot-2
topic write roblaude/2/telemetry/#
topic write roblaude/2/status
topic write roblaude/2/connection
topic write roblaude/2/mission/ack
topic write roblaude/2/mission/status
topic write roblaude/2/mission/result
topic read roblaude/2/cmd/#
```

Reload : `docker compose restart mosquitto`.

## Tester l'ACL

```bash
# Doit etre refuse : client anonyme
docker run --rm --network=host eclipse-mosquitto:2 mosquitto_sub \
    -h localhost -t 'roblaude/#' -W 2

# Doit etre refuse : robot-1 publie sur robot-2
docker run --rm --network=host eclipse-mosquitto:2 mosquitto_pub \
    -h localhost -u robot-1 -P <pwd> -t 'roblaude/2/status' -m '{}'

# Doit passer : backend ecoute tout
docker run --rm --network=host eclipse-mosquitto:2 mosquitto_sub \
    -h localhost -u backend -P <pwd> -t 'roblaude/#' -C 1 -W 3
```

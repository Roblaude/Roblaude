#!/bin/bash
# container_autostart.sh — PID 1 du container m3pro, lance notre stack ROS2
#
# Appele par Docker_M3Pro_Joy.sh au demarrage du container. Source les drivers
# hardware Yahboom (yahboomcar_ws, M3Pro_ws — DANS l'image Docker, intouchables)
# puis notre workspace bind-mounte (roblaude_ws), et lance :
#   - base_bringup (moteurs, odom, IMU, LiDAR fusion)
#   - robot_state_publisher (URDF officiel Yahboom)
#   - bridge MQTT roblaude_mqtt (broker_host lu depuis /etc/roblaude/broker_ip)
#
# Idempotent : peut etre rejoue sans casser. Premier run -> colcon build.
#
# Pas de watchdog/respawn ici (cf. retour d'experience prof : runaway bash a
# load avg 400+). Si un node meurt, on regarde son log et on `docker exec`.

# Pas de set -u : /opt/ros/humble/setup.bash plante dessus (AMENT_TRACE_SETUP_FILES)

ROBLAUDE_WS="${ROBLAUDE_WS:-/root/roblaude_ws}"
YAHBOOM_WS="${YAHBOOM_WS:-/root/yahboomcar_ws}"
M3PRO_WS="${M3PRO_WS:-/root/M3Pro_ws}"
MAPS_DIR="${MAPS_DIR:-/root/maps}"
BROKER_IP_FILE="${BROKER_IP_FILE:-/etc/roblaude/broker_ip}"

export ROS_DOMAIN_ID="${ROS_DOMAIN_ID:-30}"
export FASTDDS_BUILTIN_TRANSPORTS="${FASTDDS_BUILTIN_TRANSPORTS:-UDPv4}"

mkdir -p "$MAPS_DIR" /tmp/roslogs

# --- Deps Python non incluses dans l'image Docker Yahboom ---
# paho-mqtt manque (necessaire pour roblaude_mqtt). Installe la premiere fois
# dans /root/.local (= /home/jetson/.local cote hote via bind-mount), donc
# persiste entre recreate container — pip install ne tourne qu'une seule fois.
if ! python3 -c "import paho.mqtt" 2>/dev/null; then
    echo "[autostart] installation paho-mqtt..."
    pip install --quiet --user 'paho-mqtt~=1.6' || {
        echo "[autostart] ECHEC pip install paho-mqtt"
        echo "[autostart] le robot doit avoir internet au premier boot (ou pre-installer la dep)"
        exit 1
    }
fi

# --- Source de l'env ROS et des drivers Yahboom (dans l'image, jamais wipes) ---
source /opt/ros/humble/setup.bash
[ -f "$YAHBOOM_WS/install/setup.bash" ] && source "$YAHBOOM_WS/install/setup.bash"
[ -f "$M3PRO_WS/install/setup.bash" ]   && source "$M3PRO_WS/install/setup.bash"

# --- First-run build du workspace RobLaude si vide ---
if [ -d "$ROBLAUDE_WS/src" ] && [ ! -f "$ROBLAUDE_WS/install/setup.bash" ]; then
  echo "[autostart] premier build du workspace RobLaude..."
  # pipefail pour que le code retour de colcon remonte au-dessus de tail
  set -o pipefail
  if ( cd "$ROBLAUDE_WS" && colcon build --symlink-install ) 2>&1 | tail -20; then
    echo "[autostart] colcon build OK"
  else
    echo "[autostart] ECHEC colcon build — nodes RobLaude ne seront pas lances"
  fi
  set +o pipefail
fi

[ -f "$ROBLAUDE_WS/install/setup.bash" ] && source "$ROBLAUDE_WS/install/setup.bash"

# --- IP du broker MQTT (Mac), mise a jour par sync_time.sh ---
BROKER_HOST="localhost"
if [ -r "$BROKER_IP_FILE" ]; then
    FILE_IP="$(cat "$BROKER_IP_FILE" | tr -d '[:space:]')"
    # Fichier vide ou whitespace-only -> on garde localhost en fallback
    if [ -n "$FILE_IP" ]; then
        BROKER_HOST="$FILE_IP"
    else
        echo "[autostart] WARN $BROKER_IP_FILE vide, fallback BROKER_HOST=localhost"
    fi
fi
echo "[autostart] broker MQTT cible : $BROKER_HOST"

# --- Helper spawn : nouveau process group + log dedie ---
spawn_once() {
  local name="$1"; shift
  local logfile="/tmp/roslogs/${name}.log"
  echo "[autostart] ▶ lance $name (log $logfile)"
  setsid nohup "$@" >"$logfile" 2>&1 < /dev/null &
  disown || true
}

# --- 1) Bringup hardware (moteurs, IMU, LiDAR fusion, odom EKF) ---
spawn_once base_bringup ros2 launch M3Pro_navigation base_bringup.launch.py
sleep 5

# --- 2) URDF officiel Yahboom (frame chassis pour TF) — DESACTIVE ---
# base_bringup.launch.py (etape 1) lance deja robot_state_publisher et
# joint_state_publisher avec l'URDF Yahboom complet (14 frames dans /tf_static
# verifie en reel le 22 mai). display_launch.py les relancait en doublon, ce
# qui castait /tf_static (conflit QoS transient_local) -> chaine TF cassee ->
# slam_toolbox bloque "queue full" -> pas de mapping. On le coupe.
# spawn_once rsp ros2 launch yahboom_M3Pro_description display_launch.py
# sleep 2

# --- 3) Bridge MQTT (lit /etc/roblaude/broker_ip pour le host) ---
if [ -f "$ROBLAUDE_WS/install/roblaude_mqtt/share/roblaude_mqtt/launch/mqtt_bridge.launch.py" ]; then
    spawn_once mqtt_bridge ros2 launch roblaude_mqtt mqtt_bridge.launch.py "broker_host:=$BROKER_HOST"
else
    echo "[autostart] roblaude_mqtt pas encore build, bridge non lance"
fi

# --- 4) mission_executor — recoit cmd MQTT et drive Nav2 ---
# Necessite Nav2 (pas lance par defaut, juste base_bringup + URDF). Pour la
# demo : lancer slam.launch.py + nav2.launch.py manuellement, puis le robot
# repond aux commandes mission/cancel/resume/loading-confirmed/emergency-stop.
if [ -f "$ROBLAUDE_WS/install/roblaude_nav/lib/roblaude_nav/mission_executor" ]; then
    spawn_once mission_executor ros2 run roblaude_nav mission_executor
else
    echo "[autostart] roblaude_nav.mission_executor pas encore build, skip"
fi

echo "[autostart] tout lance. Logs : /tmp/roslogs/*.log"
echo "[autostart] verif : ros2 topic list | head"

# PID 1 doit rester en vie sinon le container meurt.
# SIGTERM -> on tue proprement les enfants.
trap 'echo "[autostart] SIGTERM — kill children"; pkill -TERM -P $$ ; sleep 2 ; pkill -KILL -P $$ ; exit 0' TERM INT
tail -f /dev/null

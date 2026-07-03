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
ROBLAUDE_MODE="${ROBLAUDE_MODE:-minimal}"
ROBLAUDE_ARM_HOME_ON_BOOT="${ROBLAUDE_ARM_HOME_ON_BOOT:-true}"

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
if ! python3 -c "import pyzbar.pyzbar" 2>/dev/null; then
    echo "[autostart] installation pyzbar (fallback QR)..."
    pip install --quiet --user 'pyzbar~=0.1' || {
        echo "[autostart] ECHEC pip install pyzbar"
        echo "[autostart] QR decode indisponible tant que pyzbar manque"
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
echo "[autostart] mode : $ROBLAUDE_MODE"

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
sleep 3   # on etale le boot : evite le pic CPU qui resettait le SSH au demarrage

# --- 4) mission_executor — recoit cmd MQTT et drive Nav2 ---
# Necessite Nav2 (pas lance par defaut, juste base_bringup + URDF). Pour la
# demo : lancer slam.launch.py + nav2.launch.py manuellement, puis le robot
# repond aux commandes mission/cancel/resume/loading-confirmed/emergency-stop.
if [ -f "$ROBLAUDE_WS/install/roblaude_nav/lib/roblaude_nav/mission_executor" ]; then
    spawn_once mission_executor ros2 run roblaude_nav mission_executor
else
    echo "[autostart] roblaude_nav.mission_executor pas encore build, skip"
fi
sleep 2

# --- 5) Perception lourde uniquement en mode full ---
# Le boot minimal garde l'USB stable pour diagnostiquer STM32/base. La camera
# Orbbec + detector consomment le meme sous-hub que CP2104/CH340 et ont deja
# provoque des deconnexions au boot. Pour la demo statique, lancer en full ou
# demarrer camera/detector manuellement apres stabilisation.
ARM_STOW='{joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90, joint6: 0, time: 1500}'
ARM_HOME='{joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90, joint6: 0, time: 2000}'

# Met le bras en HOME UNE SEULE FOIS, des que YB_Node (STM32) repond. Jamais de
# rafale (YB_Node crashe sous charge). Tourne en arriere-plan, ne bloque pas le boot.
arm_home_when_ready() {
  (
    for i in $(seq 1 30); do
      if ros2 node list 2>/dev/null | grep -q YB_Node; then
        sleep 3   # petite marge apres l'apparition du node
        ros2 topic pub --once /arm6_joints arm_msgs/msg/ArmJoints "$ARM_HOME"
        echo "[arm_home] HOME envoye (YB_Node pret)"
        exit 0
      fi
      sleep 2
    done
    echo "[arm_home] YB_Node jamais apparu en ~60s, HOME non envoye"
  ) >/tmp/roslogs/arm_home.log 2>&1 &
}

if [ "$ROBLAUDE_MODE" = "full" ]; then
    # Camera RGB-D Orbbec DaBai DCW2 (couleur rgb8 + depth, meme driver).
    if [ -f "$ROBLAUDE_WS/install/roblaude_nav/share/roblaude_nav/launch/camera.launch.py" ]; then
        spawn_once camera ros2 launch roblaude_nav camera.launch.py
    else
        echo "[autostart] camera.launch.py pas encore build, camera non lancee"
    fi
    sleep 5

    # Detecteur objet UC-02 (HSV+depth -> /roblaude/detections).
    if [ -f "$ROBLAUDE_WS/install/roblaude_pickplace/share/roblaude_pickplace/launch/pickplace.launch.py" ]; then
        spawn_once detector ros2 launch roblaude_pickplace pickplace.launch.py
    else
        echo "[autostart] roblaude_pickplace pas encore build, detecteur non lance"
    fi

    # Bras en HOME au demarrage (apres YB_Node pret), sauf maintenance.
    if [ "$ROBLAUDE_ARM_HOME_ON_BOOT" = "true" ]; then
        arm_home_when_ready
    else
        echo "[autostart] ARM_HOME skip (ROBLAUDE_ARM_HOME_ON_BOOT=false)"
    fi
else
    echo "[autostart] mode minimal : camera/detector non lances au boot"
    # Bras en HOME au boot meme en minimal (demande explicite) : YB_Node frais +
    # pas de charge = le bon moment pour partir d'une pose connue.
    if [ "$ROBLAUDE_ARM_HOME_ON_BOOT" = "true" ]; then
        arm_home_when_ready
    else
        echo "[autostart] ARM_HOME skip (ROBLAUDE_ARM_HOME_ON_BOOT=false)"
    fi
fi

echo "[autostart] tout lance. Logs : /tmp/roslogs/*.log"
echo "[autostart] verif : ros2 topic list | head"

# PID 1 doit rester en vie sinon le container meurt.
# SIGTERM (arret gracieux) -> on range d'abord le bras (YB_Node encore vivant),
# puis on tue proprement les enfants. Sur coupure brutale, impossible (pas de jus).
trap 'echo "[autostart] SIGTERM — rangement bras puis kill"; ros2 topic pub --once /arm6_joints arm_msgs/msg/ArmJoints "$ARM_STOW" 2>/dev/null; sleep 3; pkill -TERM -P $$ ; sleep 2 ; pkill -KILL -P $$ ; exit 0' TERM INT
tail -f /dev/null

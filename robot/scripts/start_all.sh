#!/bin/bash
# start_all.sh - Lance la stack ROS2 RobLaude EN MODE DEBUG MANUEL
#
# A utiliser quand l'autostart container_autostart.sh ne convient pas
# (ex: tu veux pas le bringup auto + bridge MQTT, juste les launch
# visualisation et SLAM pour cartographier).
#
# Pour le mode prod auto-au-boot, c'est container_autostart.sh qui prend
# la main via Docker_M3Pro_Joy.sh.
#
# Appel cote Mac (via start_robot.sh) :
#   docker exec m3pro bash /root/roblaude_ws/scripts/start_all.sh
#
# Prerequis : roblaude_nav et roblaude_mqtt compiles dans $ROBLAUDE_WS.

set -u

export ROS_DOMAIN_ID=30
ROBLAUDE_WS="${ROBLAUDE_WS:-/root/roblaude_ws}"
YAHBOOM_WS="${YAHBOOM_WS:-/root/yahboomcar_ws}"
BROKER_IP_FILE="${BROKER_IP_FILE:-/etc/roblaude/broker_ip}"
mkdir -p /tmp/roslogs

BROKER_HOST="localhost"
if [ -r "$BROKER_IP_FILE" ]; then
    FILE_IP="$(cat "$BROKER_IP_FILE" | tr -d '[:space:]')"
    # ne surcharge pas BROKER_HOST si fichier vide -> bridge marcherait pas
    [ -n "$FILE_IP" ] && BROKER_HOST="$FILE_IP"
fi

# PIDs des process lances, pour la verification finale
declare -A LAUNCH_PIDS

launch_bg() {
    local name="$1"; shift
    echo "-> lance $name"
    nohup bash -c "
        source /opt/ros/humble/setup.bash
        source $YAHBOOM_WS/install/setup.bash 2>/dev/null
        source $ROBLAUDE_WS/install/setup.bash 2>/dev/null
        export ROS_DOMAIN_ID=30
        $*
    " > "/tmp/roslogs/$name.log" 2>&1 &
    LAUNCH_PIDS[$name]=$!
}

# Tuer d anciennes instances pour repartir propre.
# Le '|| true' est explicite : si rien ne tourne, pkill renvoie 1 — ce
# n'est pas une erreur ici.
pkill -f foxglove_bridge    2>/dev/null || true
pkill -f web_video_server   2>/dev/null || true
pkill -f async_slam_toolbox 2>/dev/null || true
pkill -f scan_restamper     2>/dev/null || true
pkill -f odom_to_tf         2>/dev/null || true
pkill -f mqtt_bridge        2>/dev/null || true
sleep 2

# 1) Bridges de visualisation (package roblaude_nav)
launch_bg foxglove  "ros2 launch roblaude_nav foxglove.launch.py"
launch_bg webvideo  "ros2 launch roblaude_nav web_video.launch.py"

# 2) URDF robot (TF chassis) - package Yahboom
launch_bg rsp       "ros2 launch yahboom_M3Pro_description display_launch.py"

# 3) Capteurs (laser fusionne, camera) - packages Yahboom
launch_bg laser     "ros2 launch yahboom_M3Pro_laser laser_driver.launch.py"
launch_bg camera    "ros2 launch orbbec_camera dabai_dcw2.launch.py"

# 4) Re-stamper : corrige les timestamps STM32 (scan + odom)
launch_bg restamper "ros2 run roblaude_nav scan_restamper"

# Laisser les capteurs s initialiser avant SLAM
echo "⏳ attente 8s que les capteurs se stabilisent..."
sleep 8

# 5) SLAM (utilise /scan_stamped)
launch_bg slam      "ros2 launch roblaude_nav slam.launch.py"

# 6) Bridge MQTT (broker_host depuis /etc/roblaude/broker_ip)
launch_bg mqtt      "ros2 launch roblaude_mqtt mqtt_bridge.launch.py broker_host:=$BROKER_HOST"

# Verification : chaque process est-il toujours vivant 3s apres lancement ?
sleep 3
echo ""
echo "=== Etat des composants ==="
all_ok=true
for name in "${!LAUNCH_PIDS[@]}"; do
    pid=${LAUNCH_PIDS[$name]}
    if kill -0 "$pid" 2>/dev/null; then
        echo "  ✅ $name (pid $pid)"
    else
        echo "  ❌ $name a quitte — voir /tmp/roslogs/$name.log"
        all_ok=false
    fi
done

echo ""
if $all_ok; then
    echo "✅ Stack demarree. Logs : /tmp/roslogs/*.log"
else
    echo "⚠️  Certains composants ont quitte — verifier les logs ci-dessus."
fi
echo "Verif : ros2 topic hz /scan_stamped  (doit etre ~7 Hz)"

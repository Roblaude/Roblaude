#!/bin/bash
# Lance SLAM live + Nav2 (config validee) pour la demo mission.
# A lancer robot POSE sur sa marque : l'origine de la carte = position au lancement.
# Usage sur le Jetson :
#   /home/jetson/roblaude_ws/scripts/start_nav.sh           # lance slam + nav2
#   /home/jetson/roblaude_ws/scripts/start_nav.sh --reset   # tue et relance (robot deplace)
set -e

ROS_SETUP='
  source /opt/ros/humble/setup.bash
  source /root/yahboomcar_ws/install/setup.bash 2>/dev/null || true
  source /root/M3Pro_ws/install/setup.bash 2>/dev/null || true
  source /root/roblaude_ws/install/setup.bash 2>/dev/null || true
  export ROS_DOMAIN_ID=30
  export FASTDDS_BUILTIN_TRANSPORTS=UDPv4
  mkdir -p /tmp/roslogs
'

ros_exec() {
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 \
    m3pro bash -lc "$ROS_SETUP $*"
}

if ! docker ps --format '{{.Names}}' | grep -qx m3pro; then
  echo "KO: container m3pro absent"
  exit 2
fi

if [ "$1" = "--reset" ]; then
  echo "reset : arret slam + nav2 existants"
  ros_exec '
    pkill -f "[n]av2_slam_roblaude" 2>/dev/null || true
    pkill -f "[s]lam.launch" 2>/dev/null || true
    pkill -f "[a]sync_slam" 2>/dev/null || true
    pkill -f "[s]can_restamper" 2>/dev/null || true
    pkill -f "[b]t_navigator" 2>/dev/null || true
    pkill -f "[c]ontroller_server" 2>/dev/null || true
    pkill -f "[p]lanner_server" 2>/dev/null || true
    pkill -f "[b]ehavior_server" 2>/dev/null || true
    pkill -f "[l]ifecycle_manager" 2>/dev/null || true
    pkill -f "[v]elocity_smoother" 2>/dev/null || true
    pkill -f "[s]moother_server" 2>/dev/null || true
    pkill -f "[w]aypoint_follower" 2>/dev/null || true
    sleep 4
  '
fi

if ros_exec 'ros2 node list 2>/dev/null | grep -qx /slam_toolbox'; then
  echo "slam deja actif"
else
  ros_exec 'setsid nohup ros2 launch roblaude_nav slam.launch.py >/tmp/roslogs/slam.log 2>&1 < /dev/null &'
  echo "slam lance"
  sleep 18
fi

# 3 tentatives : ros2 topic hz met parfois >8s a accrocher juste apres le launch
scan_ok=false
for i in 1 2 3; do
  if ros_exec 'timeout 12 ros2 topic hz /scan_fixed 2>/dev/null | grep -m1 -q "average rate"'; then
    scan_ok=true
    break
  fi
  sleep 5
done
if [ "$scan_ok" = true ]; then
  echo "scan_fixed OK"
else
  echo "KO: /scan_fixed muet (restamper/lidar ?)"
  exit 3
fi

if ros_exec 'ros2 node list 2>/dev/null | grep -qx /bt_navigator'; then
  echo "nav2 deja actif"
else
  ros_exec 'setsid nohup ros2 launch roblaude_nav nav2_slam_roblaude.launch.py >/tmp/roslogs/nav2.log 2>&1 < /dev/null &'
  echo "nav2 lance"
  sleep 35
fi

state=$(ros_exec 'timeout 12 ros2 lifecycle get /planner_server 2>/dev/null' || true)
case "$state" in
  *active*) echo "nav2 OK (planner active)" ;;
  *) echo "KO: planner_server pas actif ($state)"; exit 4 ;;
esac

echo "pret pour une mission (Demo 1 clic)"

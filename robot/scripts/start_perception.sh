#!/bin/bash
# Lance camera + detecteur apres stabilisation du boot minimal.
# Usage sur le Jetson :
#   /home/jetson/roblaude_ws/scripts/start_perception.sh
set -e

docker exec \
  -e ROS_DOMAIN_ID=30 \
  -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 \
  m3pro bash -lc '
    source /opt/ros/humble/setup.bash
    source /root/yahboomcar_ws/install/setup.bash 2>/dev/null || true
    source /root/M3Pro_ws/install/setup.bash 2>/dev/null || true
    source /root/roblaude_ws/install/setup.bash 2>/dev/null || true
    mkdir -p /tmp/roslogs

    if ! ros2 node list 2>/dev/null | grep -q "^/camera/camera$"; then
      setsid nohup ros2 launch roblaude_nav camera.launch.py >/tmp/roslogs/camera.log 2>&1 < /dev/null &
      echo "camera lancee"
      sleep 5
    else
      echo "camera deja active"
    fi

    if ! ros2 node list 2>/dev/null | grep -q "^/object_detector$"; then
      setsid nohup ros2 launch roblaude_pickplace pickplace.launch.py >/tmp/roslogs/detector.log 2>&1 < /dev/null &
      echo "detecteur lance"
    else
      echo "detecteur deja actif"
    fi
  '

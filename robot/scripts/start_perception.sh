#!/bin/bash
# Lance camera + detecteur apres stabilisation du boot minimal.
# Usage sur le Jetson :
#   /home/jetson/roblaude_ws/scripts/start_perception.sh
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
  docker exec \
    -e ROS_DOMAIN_ID=30 \
    -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 \
    m3pro bash -lc "$ROS_SETUP $*"
}

node_exists() {
  name=$1
  ros_exec "ros2 node list 2>/dev/null | grep -qx '$name'"
}

camera_frames_ok() {
  ros_exec '
    timeout 8 ros2 topic echo /camera/color/camera_info --once >/tmp/roblaude_camera_info_check 2>/dev/null &&
    timeout 8 ros2 topic echo /camera/color/image_raw --once >/tmp/roblaude_camera_color_check 2>/dev/null
  '
}

stop_perception_nodes() {
  ros_exec '
    pkill -f "[r]oblaude_nav camera.launch.py" 2>/dev/null || true
    pkill -f "[c]amera_container" 2>/dev/null || true
    pkill -f "[o]bject_detector" 2>/dev/null || true
    sleep 3
  '
}

start_camera_once() {
  ros_exec '
    setsid nohup ros2 launch roblaude_nav camera.launch.py >/tmp/roslogs/camera.log 2>&1 < /dev/null &
  '
  echo "camera lancee"
  sleep 8
}

start_detector_once() {
  ros_exec '
    setsid nohup ros2 launch roblaude_pickplace pickplace.launch.py >/tmp/roslogs/detector.log 2>&1 < /dev/null &
  '
  echo "detecteur lance"
  sleep 2
}

if ! docker ps --format '{{.Names}}' | grep -qx m3pro; then
  echo "KO: container m3pro absent"
  exit 2
fi

if camera_frames_ok; then
  echo "camera OK"
else
  if node_exists /camera/camera; then
    echo "camera active mais sans frames -> relance"
    stop_perception_nodes
  fi
  start_camera_once
  if ! camera_frames_ok; then
    echo "KO: camera sans frames apres relance"
    ros_exec 'tail -80 /tmp/roslogs/camera.log 2>/dev/null || true'
    exit 3
  fi
  echo "camera OK"
fi

if node_exists /object_detector; then
  echo "detecteur deja actif"
else
  start_detector_once
fi

if ros_exec 'ros2 topic info /roblaude/qr_detections >/dev/null 2>&1'; then
  echo "qr topic OK"
else
  echo "KO: /roblaude/qr_detections absent"
  ros_exec 'tail -80 /tmp/roslogs/detector.log 2>/dev/null || true'
  exit 4
fi

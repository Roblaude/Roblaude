#!/bin/bash
# Preflight demo RobLaude : verifie et repare les points qui cassent l'oral.
# Par defaut : check seul. Avec --repair : tente les reparations ciblees.
set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPAIR=false
START_CAMERA=false
BOOT_ONLY=false
LOG_DIR=/var/log/roblaude
LOG="$LOG_DIR/demo_preflight_$(date +%Y%m%d-%H%M%S).log"
STATUS_FILE=${ROBLAUDE_PREFLIGHT_STATUS_FILE:-/run/roblaude-demo-preflight.status}

for arg in "$@"; do
  case "$arg" in
    --repair) REPAIR=true ;;
    --start-camera) START_CAMERA=true ;;
    --boot) BOOT_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--repair] [--start-camera] [--boot]"
      exit 0
      ;;
  esac
done

install -d -o root -g root -m 0755 "$LOG_DIR" 2>/dev/null || mkdir -p "$LOG_DIR"

log() {
  echo "$*"
  echo "$*" >> "$LOG" 2>/dev/null || true
}

ok() { log "OK  $*"; }
warn() { log "WARN $*"; }
ko() { log "KO  $*"; FAILED=true; }

write_status() {
  status=$1
  reason=${2:-}
  install -d -m 0755 "$(dirname "$STATUS_FILE")" 2>/dev/null || true
  {
    echo "status=$status"
    echo "reason=$reason"
    echo "log=$LOG"
    date -Is 2>/dev/null | sed 's/^/time=/'
  } > "$STATUS_FILE" 2>/dev/null || true
}

FAILED=false
RESTARTED_M3PRO=false

usb_present() {
  lsusb -d "$1" >/dev/null 2>&1
}

check_usb() {
  # ch341 = micro, pas utilise par la demo -> warn seulement, ne bloque pas le boot
  usb_present 1a86:7522 || warn "USB optionnel absent: ch341 (micro)"
  missing=""
  usb_present 2357:012e || missing="$missing wifi"
  usb_present 10c4:ea60 || missing="$missing stm32"
  usb_present 2bc5:06a0 || missing="$missing orbbec_depth"
  usb_present 2bc5:0561 || missing="$missing orbbec_rgb"

  if [ -z "$missing" ]; then
    ok "USB critiques presents"
    return 0
  fi

  warn "USB manquants:$missing"
  if [ "$REPAIR" = true ]; then
    if command -v roblaude-usb-boot-guard.sh >/dev/null 2>&1; then
      log "repair: roblaude-usb-boot-guard.sh"
      roblaude-usb-boot-guard.sh >> "$LOG" 2>&1 || true
    elif [ -x /home/jetson/roblaude_ws/scripts/roblaude-usb-boot-guard.sh ]; then
      log "repair: workspace roblaude-usb-boot-guard.sh"
      /home/jetson/roblaude_ws/scripts/roblaude-usb-boot-guard.sh >> "$LOG" 2>&1 || true
    else
      warn "boot guard absent"
    fi
  fi

  missing_after=""
  usb_present 2357:012e || missing_after="$missing_after wifi"
  usb_present 10c4:ea60 || missing_after="$missing_after stm32"
  usb_present 2bc5:06a0 || missing_after="$missing_after orbbec_depth"
  usb_present 2bc5:0561 || missing_after="$missing_after orbbec_rgb"
  [ -z "$missing_after" ] && { ok "USB revenus apres repair"; write_status "GO" "usb-ok"; return 0; }
  write_status "NO_GO" "usb-missing:$missing_after"
  ko "USB toujours manquants:$missing_after"
  return 1
}

m3pro_running() {
  docker ps --format '{{.Names}}' | grep -qx m3pro
}

m3pro_usb_dynamic_ok() {
  m3pro_running || return 1
  docker exec m3pro bash -lc "grep -q 'c 189:\\* rwm' /sys/fs/cgroup/devices/devices.list 2>/dev/null" >/dev/null 2>&1
}

recreate_m3pro() {
  [ "$REPAIR" = true ] || return 1
  log "repair: recreate m3pro avec Docker_M3Pro_Joy.sh"
  if [ -x /home/jetson/Docker_M3Pro_Joy.sh ]; then
    ROBLAUDE_ARM_HOME_ON_BOOT=false /home/jetson/Docker_M3Pro_Joy.sh >> "$LOG" 2>&1 || return 1
  elif [ -x /home/jetson/roblaude_ws/scripts/Docker_M3Pro_Joy.sh ]; then
    ROBLAUDE_ARM_HOME_ON_BOOT=false /home/jetson/roblaude_ws/scripts/Docker_M3Pro_Joy.sh >> "$LOG" 2>&1 || return 1
  else
    warn "Docker_M3Pro_Joy.sh absent"
    return 1
  fi
  RESTARTED_M3PRO=true
  sleep 10
  return 0
}

check_m3pro() {
  if ! m3pro_running; then
    warn "m3pro absent"
    recreate_m3pro || { ko "m3pro absent et recreate echoue"; return 1; }
  fi

  if m3pro_usb_dynamic_ok; then
    ok "m3pro USB dynamique autorise"
    return 0
  fi

  warn "m3pro sans cgroup USB dynamique c 189:*"
  recreate_m3pro || { ko "m3pro vieux droits USB et recreate echoue"; return 1; }

  if m3pro_usb_dynamic_ok; then
    ok "m3pro USB dynamique OK apres recreate"
    return 0
  fi
  ko "m3pro USB dynamique toujours KO"
  return 1
}

ros_exec() {
  docker exec \
    -e ROS_DOMAIN_ID=30 \
    -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 \
    m3pro bash -lc "
      source /opt/ros/humble/setup.bash
      source /root/yahboomcar_ws/install/setup.bash 2>/dev/null || true
      source /root/M3Pro_ws/install/setup.bash 2>/dev/null || true
      source /root/roblaude_ws/install/setup.bash 2>/dev/null || true
      export ROS_DOMAIN_ID=30
      export FASTDDS_BUILTIN_TRANSPORTS=UDPv4
      $*
    "
}

check_ros_core() {
  m3pro_running || { ko "ROS impossible, m3pro absent"; return 1; }
  nodes=$(ros_exec "timeout 8 ros2 node list" 2>/dev/null || true)
  if [ -n "$nodes" ]; then
    ok "ROS graph lisible"
  else
    ko "ROS graph illisible"
    return 1
  fi

  if echo "$nodes" | grep -q /YB_Node; then
    ok "YB_Node present"
  else
    warn "YB_Node absent dans le graphe"
  fi
}

check_stm32() {
  if [ -x /usr/local/bin/roblaude-robot-status.sh ]; then
    status=$(/usr/local/bin/roblaude-robot-status.sh 2>/dev/null || true)
    log "$status"
    echo "$status" | grep -q '"myserial_ok":true' && echo "$status" | grep -q '"stm32_data":true' \
      && { ok "STM32/micro-ROS data OK"; return 0; }
  fi

  warn "STM32/micro-ROS pas confirme"
  if [ "$REPAIR" = true ]; then
    systemctl restart micro-ros-agent.service 2>/dev/null || true
    sleep 8
    if [ -x /usr/local/bin/roblaude-robot-status.sh ]; then
      status=$(/usr/local/bin/roblaude-robot-status.sh 2>/dev/null || true)
      log "$status"
      echo "$status" | grep -q '"myserial_ok":true' && echo "$status" | grep -q '"stm32_data":true' \
        && { ok "STM32/micro-ROS OK apres restart"; return 0; }
    fi
  fi
  ko "STM32/micro-ROS KO"
  return 1
}

camera_frames_ok() {
  ros_exec "
    timeout 8 ros2 topic echo /camera/color/camera_info --once >/tmp/roblaude_preflight_camera_info 2>/dev/null &&
    timeout 8 ros2 topic echo /camera/color/image_raw --once >/tmp/roblaude_preflight_camera_color 2>/dev/null
  "
}

check_camera() {
  [ "$START_CAMERA" = true ] || { ok "camera non demandee"; return 0; }
  if camera_frames_ok; then
    ok "camera frames OK"
    return 0
  fi

  warn "camera sans frames"
  if [ "$REPAIR" = true ]; then
    /home/jetson/roblaude_ws/scripts/start_perception.sh >> "$LOG" 2>&1 || true
    if camera_frames_ok; then
      ok "camera frames OK apres start_perception"
      return 0
    fi
  fi
  ko "camera frames KO"
  return 1
}

log "=== RobLaude demo preflight $(date) repair=$REPAIR start_camera=$START_CAMERA boot=$BOOT_ONLY ==="
log "uptime: $(uptime)"
if check_usb; then
  write_status "GO" "usb-ok"
fi
if [ "$BOOT_ONLY" = true ]; then
  if [ "$FAILED" = true ]; then
    log "RESULT=NO_GO_BOOT log=$LOG"
    exit 1
  fi
  log "RESULT=GO_BOOT log=$LOG"
  exit 0
fi

if [ "$FAILED" = true ]; then
  log "STOP: USB critique KO, on ne lance pas Docker/ROS/camera en etat degrade"
  log "RESULT=NO_GO log=$LOG"
  exit 1
fi

check_m3pro || true
check_ros_core || true
check_stm32 || true
check_camera || true

if [ "$FAILED" = true ]; then
  log "RESULT=NO_GO log=$LOG"
  exit 1
fi

if [ "$RESTARTED_M3PRO" = true ]; then
  log "RESULT=GO_AFTER_M3PRO_RECREATE log=$LOG"
else
  log "RESULT=GO log=$LOG"
fi
exit 0

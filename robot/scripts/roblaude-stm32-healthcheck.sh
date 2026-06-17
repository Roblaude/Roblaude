#!/bin/bash
# Healthcheck STM32 <-> micro-ROS (timer systemd, toutes les 2 min).
# But : detecter tot une regression (agent sur le mauvais port, session morte)
# capturer le diag pour ne plus rediagnostiquer de zero, puis relink + restart.
set -u
SVC=micro-ros-agent.service
DIAGDIR=/home/jetson/roblaude_diag
STAMP=/run/roblaude-stm32-last-restart
COOLDOWN=300
mkdir -p "$DIAGDIR"
reason=""

# 1. container agent vivant ?
docker ps --format '{{.Names}}' | grep -q '^micro_ros_agent$' || reason="container micro_ros_agent absent"

# 2. myserial pointe bien sur le CP210x (jamais le CH340) ?
if [ -z "$reason" ]; then
  tgt=$(readlink -f /dev/myserial 2>/dev/null || true)
  cp=""
  for d in /dev/serial/by-id/*Silicon_Labs* /dev/serial/by-id/*CP210*; do
    [ -e "$d" ] && cp=$(readlink -f "$d") && break
  done
  [ -n "$cp" ] && [ "$tgt" != "$cp" ] && reason="myserial->$tgt mais STM32(CP210x)=$cp"
fi

# 3. YB_Node present dans le graphe ROS ? (best-effort)
if [ -z "$reason" ]; then
  docker exec -e ROS_DOMAIN_ID=30 -e FASTDDS_BUILTIN_TRANSPORTS=UDPv4 m3pro \
    bash -lc 'source /opt/ros/humble/setup.bash; timeout 8 ros2 node list 2>/dev/null | grep -q YB_Node' \
    || reason="YB_Node absent du graphe ROS"
fi

[ -z "$reason" ] && { echo "OK"; exit 0; }

# --- incident ---
F="$DIAGDIR/incident_$(date +%Y%m%d-%H%M%S).log"
{
  echo "REASON: $reason"; date; uptime
  echo "--- myserial ---"; ls -l /dev/myserial 2>&1; ls -l /dev/serial/by-id 2>&1
  echo "--- docker ps ---"; docker ps 2>&1
  echo "--- agent log ---"; docker logs --tail 40 micro_ros_agent 2>&1
  echo "--- dmesg usb ---"; dmesg 2>/dev/null | grep -Ei 'ch34|cp210|ttyusb|usb .*disconnect|Cannot enable|enumerate' | tail -30
} > "$F" 2>&1
echo "incident: $reason -> $F"

/usr/local/bin/roblaude-link-stm32.sh || true
now=$(date +%s); last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now-last)) -ge $COOLDOWN ]; then
  echo "$now" > "$STAMP"; systemctl restart "$SVC"; echo "restart $SVC"
else
  echo "cooldown actif, pas de restart"
fi
ls -1t "$DIAGDIR"/incident_*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
